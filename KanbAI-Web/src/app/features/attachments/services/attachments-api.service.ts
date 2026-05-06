import { HttpClient, HttpEvent, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../projects/models/project.model';
import {
  AssetResponseDto,
  AssetUploadResponse
} from '../models/attachment.model';

/**
 * Thin wrapper over HttpClient for the attachment upload endpoint. Returns
 * the raw HttpEvent stream so the caller (AttachmentsStateService) can
 * observe `UploadProgress` and `Response` events.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/attachment`;

  /**
   * POST /api/attachment/task/{taskId} — multipart/form-data with a single
   * 'file' field. The browser sets Content-Type automatically when the body
   * is a FormData; we must NOT set it manually (would strip the boundary).
   *
   * The global authInterceptor attaches `Authorization: Bearer <token>`
   * because the URL starts with environment.apiUrl.
   */
  uploadAttachment(
    taskId: string,
    file: File
  ): Observable<HttpEvent<AssetUploadResponse>> {
    const url = `${this.apiUrl}/task/${encodeURIComponent(taskId)}`;
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post<AssetUploadResponse>(url, formData, {
      reportProgress: true,
      observe: 'events'
    });
  }

  /**
   * GET /api/attachment/task/{taskId} — returns the list of Completed assets
   * for a task, ordered `createdAt` DESC (backend contract).
   *
   * Unwraps the ApiResponse envelope and returns the raw array. A null or
   * missing `.data` property falls back to an empty array.
   *
   * Auth: global interceptor attaches `Authorization: Bearer <token>`.
   */
  listAttachmentsByTask(taskId: string): Observable<AssetResponseDto[]> {
    const url = `${this.apiUrl}/task/${encodeURIComponent(taskId)}`;
    return this.http
      .get<ApiResponse<AssetResponseDto[]>>(url)
      .pipe(map(response => response?.data ?? []));
  }

  /**
   * GET /api/attachment/{assetId} — streams the raw file as a Blob.
   *
   *   responseType: 'blob'   — we want bytes, not JSON parsing
   *   observe: 'response'    — caller may inspect headers
   *
   * Auth: global interceptor attaches `Authorization: Bearer <token>`.
   * Do NOT use window.open or <a href> — both bypass the interceptor.
   */
  downloadAttachment(assetId: string): Observable<HttpResponse<Blob>> {
    const url = `${this.apiUrl}/${encodeURIComponent(assetId)}`;
    return this.http.get(url, {
      responseType: 'blob',
      observe: 'response'
    });
  }
}
