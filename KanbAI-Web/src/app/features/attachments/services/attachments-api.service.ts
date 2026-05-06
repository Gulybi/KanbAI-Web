import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AssetUploadResponse } from '../models/attachment.model';

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
}
