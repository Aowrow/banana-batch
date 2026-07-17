import type {
  Session,
  Message,
  GeneratedImage,
  UploadedImage,
  GenerationErrorInfo,
  GenerationSlot
} from '../types';
import { getMessageGenerationSlots, getSuccessfulImages } from '../core/generationSlots';

const DB_NAME = 'banana-batch-db';
const DB_VERSION = 2;

const STORE_SESSIONS = 'sessions';
const STORE_MESSAGES = 'messages';
const STORE_IMAGES = 'images';
const STORE_META = 'meta';

const LEGACY_SESSIONS_STORE = 'sessions';

export const APP_CACHE_BUDGET_BYTES = 500 * 1024 * 1024;
export const BACKGROUND_CLEANUP_THRESHOLD_BYTES = 300 * 1024 * 1024;
export const FORCED_CLEANUP_THRESHOLD_BYTES = 400 * 1024 * 1024;

type MetaRecord = { key: string; value: unknown };

type SessionRecord = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

type MessageRecord = {
  id: string;
  sessionId: string;
  role: 'user' | 'model';
  text?: string;
  textVariations?: string[];
  generationSettings?: Message['generationSettings'];
  selectedImageId?: string;
  timestamp: number;
  isError?: boolean;
  generationSlots?: GenerationSlotRecord[];
};

type GenerationSlotRecord =
  | { slotId: string; index: number; status: 'pending'; attempts: number }
  | { slotId: string; index: number; status: 'success'; attempts: number; imageId: string }
  | { slotId: string; index: number; status: 'failed'; attempts: number; error: GenerationErrorInfo }
  | { slotId: string; index: number; status: 'cancelled'; attempts: number; reason: string };

type ImageRecord = {
  id: string;
  sessionId: string;
  messageId: string;
  role: 'generated' | 'uploaded';
  blob?: Blob;
  dataUrl?: string;
  mimeType: string;
  name?: string;
  status: 'success' | 'error';
  size: number;
  createdAt: number;
  lastAccessedAt: number;
};

export type ClearAllSessionDataResult = {
  deletedImageCount: number;
  deletedBytes: number;
};

type LegacySessionRecord = Session;

export type StorageCleanupResult = {
  usageBytes: number;
  budgetBytes: number;
  usageRatio: number;
  deletedImageIds: string[];
  deletedBytes: number;
  mode: 'none' | 'background' | 'forced';
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const messagesStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        messagesStore.createIndex('bySessionId', 'sessionId', { unique: false });
        messagesStore.createIndex('bySessionIdTimestamp', ['sessionId', 'timestamp'], {
          unique: false
        });
      }

      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        const imagesStore = db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
        imagesStore.createIndex('byMessageId', 'messageId', { unique: false });
        imagesStore.createIndex('bySessionId', 'sessionId', { unique: false });
        imagesStore.createIndex('byLastAccessedAt', 'lastAccessedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
}

function sumImageRecordSizes(store: IDBObjectStore): Promise<ClearAllSessionDataResult> {
  return new Promise((resolve, reject) => {
    let deletedImageCount = 0;
    let deletedBytes = 0;
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve({ deletedImageCount, deletedBytes });
        return;
      }

      const record = cursor.value as ImageRecord;
      deletedImageCount += 1;
      deletedBytes += Number.isFinite(record.size) ? record.size : 0;
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  if (!meta || !data) {
    throw new Error('Invalid data URL');
  }

  const mimeMatch = meta.match(/^data:(.*?);base64$/);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to data URL'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function estimateDataUrlSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function toSessionRecord(session: Session): SessionRecord {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function toMessageRecord(sessionId: string, message: Message): MessageRecord {
  const generationSlots = message.role === 'model'
    ? getMessageGenerationSlots(message).map<GenerationSlotRecord>((slot) => {
        if (slot.status === 'success') {
          return {
            slotId: slot.slotId,
            index: slot.index,
            status: 'success',
            attempts: slot.attempts,
            imageId: slot.image.id
          };
        }
        if (slot.status === 'failed') {
          return {
            slotId: slot.slotId,
            index: slot.index,
            status: 'failed',
            attempts: slot.attempts,
            error: slot.error
          };
        }
        if (slot.status === 'cancelled') {
          return {
            slotId: slot.slotId,
            index: slot.index,
            status: 'cancelled',
            attempts: slot.attempts,
            reason: slot.reason
          };
        }
        return {
          slotId: slot.slotId,
          index: slot.index,
          status: 'pending',
          attempts: slot.attempts
        };
      })
    : undefined;

  return {
    id: message.id,
    sessionId,
    role: message.role,
    text: message.text,
    textVariations: message.textVariations,
    generationSettings: message.generationSettings,
    selectedImageId: message.selectedImageId,
    timestamp: message.timestamp,
    isError: message.isError,
    generationSlots
  };
}

function createImageRecord(
  sessionId: string,
  messageId: string,
  role: 'generated' | 'uploaded',
  image: GeneratedImage | UploadedImage,
  timestamp: number,
  status: 'success' | 'error'
): ImageRecord {
  const size = image.data ? estimateDataUrlSize(image.data) : 0;
  const blob = image.data ? dataUrlToBlob(image.data) : undefined;

  return {
    id: image.id,
    sessionId,
    messageId,
    role,
    blob,
    dataUrl: status === 'error' ? image.data : undefined,
    mimeType: image.mimeType,
    name: 'name' in image ? image.name : undefined,
    status,
    size,
    createdAt: timestamp,
    lastAccessedAt: image.lastAccessedAt ?? timestamp
  };
}

async function getMessagesForSession(db: IDBDatabase, sessionId: string): Promise<MessageRecord[]> {
  const tx = db.transaction(STORE_MESSAGES, 'readonly');
  const records = (await requestToPromise(
    tx.objectStore(STORE_MESSAGES).index('bySessionId').getAll(IDBKeyRange.only(sessionId))
  )) as MessageRecord[];
  await transactionDone(tx);
  return records;
}

async function getImagesForMessage(db: IDBDatabase, messageId: string): Promise<ImageRecord[]> {
  const tx = db.transaction(STORE_IMAGES, 'readonly');
  const records = (await requestToPromise(
    tx.objectStore(STORE_IMAGES).index('byMessageId').getAll(IDBKeyRange.only(messageId))
  )) as ImageRecord[];
  await transactionDone(tx);
  return records;
}

async function getImagesForSession(db: IDBDatabase, sessionId: string): Promise<ImageRecord[]> {
  const tx = db.transaction(STORE_IMAGES, 'readonly');
  const records = (await requestToPromise(
    tx.objectStore(STORE_IMAGES).index('bySessionId').getAll(IDBKeyRange.only(sessionId))
  )) as ImageRecord[];
  await transactionDone(tx);
  return records;
}

async function persistSessionGraph(
  db: IDBDatabase,
  session: Session
): Promise<void> {
  const existingMessages = await getMessagesForSession(db, session.id);
  const existingMessageIds = new Set(existingMessages.map((record) => record.id));
  const nextMessageIds = new Set(session.messages.map((message) => message.id));

  const existingImagesByMessageId = new Map<string, ImageRecord[]>();
  for (const message of existingMessages) {
    existingImagesByMessageId.set(message.id, await getImagesForMessage(db, message.id));
  }

  const tx = db.transaction([STORE_SESSIONS, STORE_MESSAGES, STORE_IMAGES], 'readwrite');
  const sessionStore = tx.objectStore(STORE_SESSIONS);
  const messageStore = tx.objectStore(STORE_MESSAGES);
  const imageStore = tx.objectStore(STORE_IMAGES);

  sessionStore.put(toSessionRecord(session));

  for (const staleMessageId of existingMessageIds) {
    if (!nextMessageIds.has(staleMessageId)) {
      messageStore.delete(staleMessageId);
      const staleImages = existingImagesByMessageId.get(staleMessageId) ?? [];
      for (const image of staleImages) {
        imageStore.delete(image.id);
      }
    }
  }

  for (const message of session.messages) {
    messageStore.put(toMessageRecord(session.id, message));

    const generatedImages = getSuccessfulImages(message);
    const nextImages = [...generatedImages, ...(message.uploadedImages ?? [])];
    const nextImageIds = new Set(nextImages.map((image) => image.id));

    const existingImages = existingImagesByMessageId.get(message.id) ?? [];

    for (const staleImage of existingImages) {
      if (!nextImageIds.has(staleImage.id)) {
        imageStore.delete(staleImage.id);
      }
    }

    for (const image of generatedImages) {
      imageStore.put(
        createImageRecord(session.id, message.id, 'generated', image, message.timestamp, image.status)
      );
    }

    for (const image of message.uploadedImages ?? []) {
      imageStore.put(
        createImageRecord(session.id, message.id, 'uploaded', image, message.timestamp, 'success')
      );
    }
  }

  await transactionDone(tx);
}

async function hydrateImageRecord(record: ImageRecord): Promise<GeneratedImage | UploadedImage> {
  let data = record.dataUrl;
  if (!data && record.blob) {
    data = await blobToDataUrl(record.blob);
  }

  return {
    id: record.id,
    data: data || '',
    mimeType: record.mimeType,
    status: record.status,
    name: record.name,
    storageSize: record.size,
    lastAccessedAt: record.lastAccessedAt
  } as GeneratedImage | UploadedImage;
}

async function hydrateSession(db: IDBDatabase, sessionRecord: SessionRecord): Promise<Session> {
  const messageRecords = await getMessagesForSession(db, sessionRecord.id);

  messageRecords.sort((a, b) => a.timestamp - b.timestamp);

  const messages: Message[] = [];

  for (const messageRecord of messageRecords) {
    const imageRecords = await getImagesForMessage(db, messageRecord.id);

    imageRecords.sort((a, b) => a.createdAt - b.createdAt);

    const generatedImages: GeneratedImage[] = [];
    const uploadedImages: UploadedImage[] = [];

    for (const imageRecord of imageRecords) {
      const hydrated = await hydrateImageRecord(imageRecord);
      if (imageRecord.role === 'generated') {
        generatedImages.push(hydrated as GeneratedImage);
      } else {
        uploadedImages.push(hydrated as UploadedImage);
      }
    }

    let generationSlots: GenerationSlot[];
    if (messageRecord.generationSlots) {
      generationSlots = messageRecord.generationSlots
        .map<GenerationSlot>((slot) => {
          if (slot.status === 'success') {
            const image = generatedImages.find((candidate) => candidate.id === slot.imageId);
            if (image) return { ...slot, image };
            return {
              slotId: slot.slotId,
              index: slot.index,
              status: 'failed',
              attempts: slot.attempts,
              error: {
                kind: 'unknown',
                message: '图片缓存缺失，无法恢复该生成结果。',
                attempts: slot.attempts,
                retryable: true
              }
            };
          }
          if (slot.status === 'pending') {
            return {
              slotId: slot.slotId,
              index: slot.index,
              status: 'cancelled',
              attempts: slot.attempts,
              reason: '页面刷新导致生成任务中断。'
            };
          }
          return slot;
        })
        .sort((left, right) => left.index - right.index);
    } else {
      generationSlots = generatedImages.map((image, index) =>
        image.status === 'success'
          ? { slotId: image.id, index, status: 'success', attempts: 1, image }
          : {
              slotId: image.id,
              index,
              status: 'failed',
              attempts: 1,
              error: {
                kind: 'unknown',
                message: '旧版本未保存该图片的失败原因。',
                attempts: 1,
                retryable: true
              }
            }
      );
    }

    const selectedImageExists =
      !messageRecord.selectedImageId || generationSlots.some(
        (slot) => slot.status === 'success' && slot.image.id === messageRecord.selectedImageId
      );

    messages.push({
      id: messageRecord.id,
      role: messageRecord.role,
      text: messageRecord.text,
      textVariations: messageRecord.textVariations,
      generationSlots: generationSlots.length > 0 ? generationSlots : undefined,
      uploadedImages: uploadedImages.length > 0 ? uploadedImages : undefined,
      generationSettings: messageRecord.generationSettings,
      selectedImageId: selectedImageExists ? messageRecord.selectedImageId : undefined,
      timestamp: messageRecord.timestamp,
      isError: messageRecord.isError
    });
  }

  return {
    ...sessionRecord,
    messages,
    messageCount: messages.length
  };
}

async function getProtectedImageIds(db: IDBDatabase): Promise<Set<string>> {
  const sessionsTx = db.transaction(STORE_SESSIONS, 'readonly');
  const sessions = (await requestToPromise(
    sessionsTx.objectStore(STORE_SESSIONS).getAll()
  )) as SessionRecord[];
  await transactionDone(sessionsTx);

  const protectedIds = new Set<string>();
  const currentSessionId = await getMetaValue<string>('currentSessionId');

  for (const session of sessions) {
    const messageRecords = await getMessagesForSession(db, session.id);

    for (const message of messageRecords) {
      if (message.selectedImageId) {
        protectedIds.add(message.selectedImageId);
      }
    }

    if (session.id === currentSessionId) {
      const currentImages = await getImagesForSession(db, session.id);
      for (const image of currentImages) {
        protectedIds.add(image.id);
      }
    }
  }

  return protectedIds;
}

async function migrateLegacySessions(db: IDBDatabase): Promise<void> {
  const alreadyMigrated = await getMetaValue<boolean>('schemaV2Migrated');
  if (alreadyMigrated) {
    return;
  }

  if (!db.objectStoreNames.contains(LEGACY_SESSIONS_STORE)) {
    await setMetaValue('schemaV2Migrated', true);
    return;
  }

  const tx = db.transaction(LEGACY_SESSIONS_STORE, 'readonly');
  const legacyStore = tx.objectStore(LEGACY_SESSIONS_STORE);
  const rawSessions = (await requestToPromise(legacyStore.getAll())) as Array<SessionRecord | LegacySessionRecord>;
  await transactionDone(tx);

  const legacySessions = rawSessions.filter(
    (record): record is LegacySessionRecord => 'messages' in record && Array.isArray(record.messages)
  );

  if (legacySessions.length === 0) {
    await setMetaValue('schemaV2Migrated', true);
    return;
  }

  for (const session of legacySessions) {
    await persistSessionGraph(db, session);
  }

  await setMetaValue('schemaV2Migrated', true);
}

export async function getAllSessions(): Promise<Session[]> {
  const db = await openDb();
  try {
    await migrateLegacySessions(db);
    const records = (await requestToPromise(
      db.transaction(STORE_SESSIONS, 'readonly').objectStore(STORE_SESSIONS).getAll()
    )) as SessionRecord[];

    const sessions = await Promise.all(records.map((record) => hydrateSession(db, record)));
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  } finally {
    db.close();
  }
}

export async function putSession(session: Session): Promise<void> {
  const db = await openDb();
  try {
    await persistSessionGraph(db, session);
  } finally {
    db.close();
  }
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  const db = await openDb();
  try {
    const messageRecords = await getMessagesForSession(db, sessionId);
    const imageRecords = await getImagesForSession(db, sessionId);
    const tx = db.transaction([STORE_SESSIONS, STORE_MESSAGES, STORE_IMAGES], 'readwrite');
    const sessionStore = tx.objectStore(STORE_SESSIONS);
    const messageStore = tx.objectStore(STORE_MESSAGES);
    const imageStore = tx.objectStore(STORE_IMAGES);

    for (const message of messageRecords) {
      messageStore.delete(message.id);
    }

    for (const image of imageRecords) {
      imageStore.delete(image.id);
    }

    sessionStore.delete(sessionId);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function clearAllSessionData(
  emptySession: Session
): Promise<ClearAllSessionDataResult> {
  const db = await openDb();
  try {
    const tx = db.transaction(
      [STORE_SESSIONS, STORE_MESSAGES, STORE_IMAGES, STORE_META],
      'readwrite'
    );
    const sessionStore = tx.objectStore(STORE_SESSIONS);
    const messageStore = tx.objectStore(STORE_MESSAGES);
    const imageStore = tx.objectStore(STORE_IMAGES);
    const metaStore = tx.objectStore(STORE_META);
    const deleted = await sumImageRecordSizes(imageStore);

    sessionStore.clear();
    messageStore.clear();
    imageStore.clear();
    metaStore.clear();
    sessionStore.put(toSessionRecord(emptySession));
    metaStore.put({ key: 'currentSessionId', value: emptySession.id } as MetaRecord);
    metaStore.put({ key: 'schemaV2Migrated', value: true } as MetaRecord);

    await transactionDone(tx);
    return deleted;
  } finally {
    db.close();
  }
}

export async function setMetaValue<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value } as MetaRecord);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function getMetaValue<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_META, 'readonly');
    const record = (await requestToPromise(tx.objectStore(STORE_META).get(key))) as MetaRecord | undefined;
    await transactionDone(tx);
    return record?.value as T | undefined;
  } finally {
    db.close();
  }
}

export async function touchImageAccess(imageIds: string[]): Promise<void> {
  if (imageIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(imageIds)];

  const db = await openDb();
  try {
    const now = Date.now();
    const imageRecords = await Promise.all(
      uniqueIds.map(async (id) => {
        const tx = db.transaction(STORE_IMAGES, 'readonly');
        const record = (await requestToPromise(tx.objectStore(STORE_IMAGES).get(id))) as
          | ImageRecord
          | undefined;
        await transactionDone(tx);
        return record;
      })
    );

    const writableRecords = imageRecords.filter((record): record is ImageRecord => !!record);
    if (writableRecords.length === 0) {
      return;
    }

    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);

    for (const existing of writableRecords) {
      store.put({ ...existing, lastAccessedAt: now });
    }

    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export type AppStorageEstimate = {
  usageBytes: number;
  budgetBytes: number;
  usageRatio: number;
  browserQuotaBytes: number;
};

async function estimateUsage(): Promise<AppStorageEstimate> {
  const browserEstimatePromise = navigator.storage?.estimate
    ? navigator.storage.estimate()
    : Promise.resolve(undefined);
  const db = await openDb();
  let usageBytes = 0;

  try {
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const imageUsage = await sumImageRecordSizes(tx.objectStore(STORE_IMAGES));
    await transactionDone(tx);
    usageBytes = imageUsage.deletedBytes;
  } finally {
    db.close();
  }

  const browserEstimate = await browserEstimatePromise;
  const browserQuotaBytes = browserEstimate?.quota ?? 0;
  const budgetBytes = APP_CACHE_BUDGET_BYTES;
  const usageRatio = budgetBytes > 0 ? usageBytes / budgetBytes : 0;

  return { usageBytes, budgetBytes, usageRatio, browserQuotaBytes };
}

export async function getStorageEstimate() {
  return estimateUsage();
}

export async function maybeCleanupStorage(): Promise<StorageCleanupResult> {
  const estimate = await estimateUsage();
  const { usageBytes } = estimate;

  if (usageBytes < BACKGROUND_CLEANUP_THRESHOLD_BYTES) {
    return {
      usageBytes: estimate.usageBytes,
      budgetBytes: estimate.budgetBytes,
      usageRatio: estimate.usageRatio,
      deletedImageIds: [],
      deletedBytes: 0,
      mode: 'none'
    };
  }

  const targetUsageBytes = BACKGROUND_CLEANUP_THRESHOLD_BYTES;
  const protectedImageIds = new Set<string>();
  const db = await openDb();

  try {
    const pinned = await getProtectedImageIds(db);
    for (const id of pinned) {
      protectedImageIds.add(id);
    }

    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    const candidates = (await requestToPromise(store.index('byLastAccessedAt').getAll())) as ImageRecord[];

    let deletedBytes = 0;
    const deletedImageIds: string[] = [];
    let projectedUsage = estimate.usageBytes;

    for (const image of candidates) {
      if (protectedImageIds.has(image.id)) {
        continue;
      }

      if (projectedUsage <= targetUsageBytes) {
        break;
      }

      store.delete(image.id);
      deletedImageIds.push(image.id);
      deletedBytes += image.size;
      projectedUsage = Math.max(0, projectedUsage - image.size);
    }

    await transactionDone(tx);

    return {
      usageBytes: projectedUsage,
      budgetBytes: estimate.budgetBytes,
      usageRatio: estimate.budgetBytes > 0 ? projectedUsage / estimate.budgetBytes : 0,
      deletedImageIds,
      deletedBytes,
      mode: usageBytes >= FORCED_CLEANUP_THRESHOLD_BYTES ? 'forced' : 'background'
    };
  } finally {
    db.close();
  }
}
