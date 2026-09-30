import { BrowserWindow, dialog, IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  IpcResult,
  TeachingAwardApplication,
  TeachingAwardApplicationDownloadPayload,
  TeachingAwardApplicationListPayload,
  TeachingAwardApplicationsZipPayload,
  TeachingAwardCategory,
  TeachingAwardDownloadFailure,
  TeachingAwardDownloadResult,
} from '../../shared/types';
import { formatError } from './ipcError';

interface TeachingAwardApplicationRow {
  id: string;
  award_period_id: string;
  applicant_email: string;
  full_name: string;
  category: TeachingAwardCategory;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size_bytes: number;
  submitted_at: string;
}

interface ZipEntry {
  name: string;
  data: Buffer;
  modifiedAt: Date;
}

const APPLICATION_COLUMNS =
  'id,award_period_id,applicant_email,full_name,category,storage_bucket,storage_path,original_file_name,mime_type,file_size_bytes,submitted_at';

const CRC_TABLE = createCrcTable();

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function createZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);
    const dos = toDosDateTime(entry.modifiedAt);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dos.time, 10);
    localHeader.writeUInt16LE(dos.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dos.time, 12);
    centralHeader.writeUInt16LE(dos.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, fileName, entry.data);
    centralParts.push(centralHeader, fileName);
    offset += localHeader.length + fileName.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function sanitizeFileSegment(value: string): string {
  const withoutControlCharacters = Array.from(value)
    .filter(character => character.charCodeAt(0) >= 32)
    .join('');
  const clean = withoutControlCharacters
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return clean || 'untitled';
}

function applicationFileName(row: TeachingAwardApplicationRow): string {
  const extension = path.extname(row.original_file_name).toLowerCase() === '.pdf' ? '' : '.pdf';
  return `${sanitizeFileSegment(row.full_name)}_${row.id.slice(0, 8)}_${sanitizeFileSegment(row.original_file_name)}${extension}`;
}

function zipFileName(category?: TeachingAwardCategory): string {
  const date = new Date().toISOString().slice(0, 10);
  const prefix = category ? sanitizeFileSegment(category) : 'teaching-award-applications';
  return `${prefix}_${date}.zip`;
}

function toApplication(row: TeachingAwardApplicationRow): TeachingAwardApplication {
  return {
    id: row.id,
    awardPeriodId: row.award_period_id,
    applicantEmail: row.applicant_email,
    fullName: row.full_name,
    category: row.category,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    submittedAt: row.submitted_at,
  };
}

function parentWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function showSaveDialog(
  event: IpcMainInvokeEvent,
  options: Electron.SaveDialogOptions,
): Promise<Electron.SaveDialogReturnValue> {
  const window = parentWindow(event);
  return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options);
}

async function downloadStorageFile(client: SupabaseClient, row: TeachingAwardApplicationRow): Promise<Buffer> {
  const { data, error } = await client.storage.from(row.storage_bucket).download(row.storage_path);

  if (error) {
    throw error;
  }

  return Buffer.from(await data.arrayBuffer());
}

export function createApplicationDownloadHandlers(client: SupabaseClient) {
  return {
    async list(
      _event: IpcMainInvokeEvent,
      payload: TeachingAwardApplicationListPayload = {},
    ): Promise<IpcResult<TeachingAwardApplication[]>> {
      try {
        let query = client
          .from('teaching_award_applications')
          .select(APPLICATION_COLUMNS)
          .order('submitted_at', { ascending: false });

        if (payload.awardPeriodId) {
          query = query.eq('award_period_id', payload.awardPeriodId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return {
          success: true,
          data: (data ?? []).map(row => toApplication(row as TeachingAwardApplicationRow)),
        };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    },

    async download(
      event: IpcMainInvokeEvent,
      payload: TeachingAwardApplicationDownloadPayload,
    ): Promise<IpcResult<TeachingAwardDownloadResult>> {
      try {
        const { data, error } = await client
          .from('teaching_award_applications')
          .select(APPLICATION_COLUMNS)
          .eq('id', payload.applicationId)
          .single();

        if (error) throw error;
        const row = data as TeachingAwardApplicationRow;
        const fileName = applicationFileName(row);
        const saveResult = await showSaveDialog(event, {
          title: 'Download application PDF',
          defaultPath: fileName,
          filters: [{ name: 'PDF document', extensions: ['pdf'] }],
        });

        if (saveResult.canceled || !saveResult.filePath) {
          return { success: true, data: { cancelled: true, downloadedCount: 0, failures: [] } };
        }

        const file = await downloadStorageFile(client, row);
        await fs.writeFile(saveResult.filePath, file);
        return {
          success: true,
          data: {
            cancelled: false,
            savedPath: saveResult.filePath,
            downloadedCount: 1,
            failures: [],
          },
        };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    },

    async downloadZip(
      event: IpcMainInvokeEvent,
      payload: TeachingAwardApplicationsZipPayload,
    ): Promise<IpcResult<TeachingAwardDownloadResult>> {
      try {
        let query = client
          .from('teaching_award_applications')
          .select(APPLICATION_COLUMNS)
          .eq('award_period_id', payload.awardPeriodId)
          .order('category')
          .order('full_name');

        if (payload.category) {
          query = query.eq('category', payload.category);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = (data ?? []) as TeachingAwardApplicationRow[];
        if (rows.length === 0) {
          throw new Error('No PDF applications were found for this selection.');
        }

        const saveResult = await showSaveDialog(event, {
          title: payload.category ? 'Download category ZIP' : 'Download all application PDFs',
          defaultPath: zipFileName(payload.category),
          filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
        });

        if (saveResult.canceled || !saveResult.filePath) {
          return { success: true, data: { cancelled: true, downloadedCount: 0, failures: [] } };
        }

        const entries: ZipEntry[] = [];
        const failures: TeachingAwardDownloadFailure[] = [];

        for (const row of rows) {
          try {
            const file = await downloadStorageFile(client, row);
            const folder = payload.category ? '' : `${sanitizeFileSegment(row.category)}/`;
            entries.push({
              name: `${folder}${applicationFileName(row)}`,
              data: file,
              modifiedAt: new Date(row.submitted_at),
            });
          } catch (downloadError) {
            failures.push({
              applicationId: row.id,
              fileName: row.original_file_name,
              error: formatError(downloadError),
            });
          }
        }

        if (entries.length === 0) {
          throw new Error('None of the selected PDFs could be downloaded from Supabase Storage.');
        }

        await fs.writeFile(saveResult.filePath, createZip(entries));
        return {
          success: true,
          data: {
            cancelled: false,
            savedPath: saveResult.filePath,
            downloadedCount: entries.length,
            failures,
          },
        };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    },
  };
}
