import type { ApiClient } from '@/services/api/client';
import type { ApiResult } from '@/types/envelope';
import { ApiRequestError } from '@/services/api/errors';

/** A local file to upload — the shape expo-image-picker / document-picker assets expose. */
export interface LocalFile {
  /** Local file URI (e.g. file:///... from the image picker). */
  readonly uri: string;
  /** File name to send; a sensible default is used when omitted. */
  readonly name?: string;
  /** MIME type; defaults to image/jpeg when omitted. */
  readonly mimeType?: string;
}

/** What to attach the uploaded file to (mirrors the backend StoreFileRequest owning fields). */
export interface UploadFileOptions {
  readonly owningResourceType: string;
  readonly communityId: string;
  readonly owningResourceId?: string;
}

/** The opaque stored-file reference the upload returns — the File_Service id used to download it. */
export interface StoredFileReference {
  readonly reference: string;
}

/**
 * Raw body of `POST /api/v1/files` (mirrors the backend `StoredFileReference` record). The stored
 * file's `id` IS the reference used by `GET /api/v1/files/{id}` — the server does NOT return a field
 * literally named `reference`, so the client must read `id`. (Reading a non-existent `reference`
 * field was the bug: it came back undefined, so no photo id was ever saved or shown.)
 */
interface StoredFileResponse {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

/**
 * Multipart file-upload client over `POST /api/v1/files` (Req 6.1, 7.1). The shared {@link ApiClient}
 * always sends a JSON body, so a file upload can't ride it — this builds its own `FormData` request
 * but reuses the client's base URL + bearer token (single source of truth; no hardcoded URL, no
 * duplicated auth). Returns the opaque reference to store on the owning entity's `*FileId`.
 *
 * <p>React Native's `fetch` accepts a `{ uri, name, type }` part for a local file; no bytes are read
 * into JS. The browser/Node path (tests) can pass a `Blob`/`File` the same way.</p>
 */
/** An RN `<Image source>` for an authorized file download: the resolved URL + bearer header. */
export interface AuthorizedImageSource {
  readonly uri: string;
  readonly headers: Record<string, string>;
}

export class FileClient {
  constructor(
    private readonly api: ApiClient,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Build an `<Image source>` for a stored file reference. There is no public file route — the bytes
   * are only reachable through the authorized `GET /api/v1/files/{reference}` endpoint — so the
   * bearer token is attached as a request header (RN `Image` supports `source={{ uri, headers }}`).
   * Returns null when there is no reference or no token, so callers can fall back to a placeholder.
   */
  downloadSource(reference: string | null | undefined): AuthorizedImageSource | null {
    if (!reference) return null;
    const token = this.api.currentAccessToken();
    if (!token) return null;
    return {
      uri: this.api.resolveUrl(`/api/v1/files/${encodeURIComponent(reference)}`),
      headers: { Authorization: `Bearer ${token}` },
    };
  }

  /** Upload a local file and return its stored reference. Throws {@link ApiRequestError} on failure. */
  async upload(file: LocalFile, options: UploadFileOptions): Promise<StoredFileReference> {
    const mime = (file.mimeType ?? 'image/jpeg').toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new ApiRequestError({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Only image files can be uploaded.',
        correlationId: '',
        httpStatus: 415,
      });
    }
    // The minimal-API endpoint binds `IFormFile file` from the multipart body but the
    // owningResourceType / communityId / owningResourceId arguments from the QUERY STRING — so these
    // go on the URL, not as form fields (sending them as form fields yields "parameter not provided").
    const qs = new URLSearchParams({
      owningResourceType: options.owningResourceType,
      communityId: options.communityId,
      ...(options.owningResourceId ? { owningResourceId: options.owningResourceId } : {}),
    }).toString();
    const url = this.api.resolveUrl(`/api/v1/files?${qs}`);

    const form = new FormData();
    // RN FormData file part: { uri, name, type }. Cast through unknown — RN's FormData.append
    // accepts this object shape even though the DOM lib types only allow string | Blob.
    form.append('file', {
      uri: file.uri,
      name: file.name ?? 'photo.jpg',
      type: file.mimeType ?? 'image/jpeg',
    } as unknown as Blob);

    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.api.currentAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    // Deliberately NOT setting Content-Type — fetch sets the multipart boundary itself.

    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: 'POST', headers, body: form });
    } catch (cause) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(`[API-NET] POST ${url} (upload) failed: ${String((cause as Error)?.message ?? cause)}`);
      }
      throw new ApiRequestError({
        code: 'INTEGRATION_FAILURE',
        message: 'Photo upload failed. Check your connection and try again.',
        correlationId: '',
        httpStatus: 0,
      });
    }

    let envelope: ApiResult<StoredFileResponse> | null = null;
    try {
      envelope = (await response.json()) as ApiResult<StoredFileResponse>;
    } catch {
      envelope = null;
    }

    if (envelope?.success && response.ok && envelope.data?.id) {
      // The stored file's id is the opaque reference used to download it later.
      return { reference: envelope.data.id };
    }
    if (envelope?.error) {
      throw ApiRequestError.fromApiError(envelope.error, envelope.correlationId ?? '', response.status);
    }
    throw new ApiRequestError({
      code: 'INTERNAL_ERROR',
      message: `Photo upload failed (HTTP ${response.status}).`,
      correlationId: '',
      httpStatus: response.status,
    });
  }
}
