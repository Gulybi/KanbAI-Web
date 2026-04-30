import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  MembersApiService,
  mapMemberErrorToUserMessage
} from './members-api.service';
import { AddMemberResponse, MemberSummary, MembersListResponse } from '../models/member.model';
import { environment } from '../../../../environments/environment';

const BASE_URL = `${environment.apiUrl}/project`;
const PROJECT_ID = 'proj-1';

function makeMember(partial?: Partial<MemberSummary>): MemberSummary {
  return {
    userId: 'u-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Member',
    joinedAt: '2026-04-29T14:12:00Z',
    ...partial
  };
}

describe('MembersApiService', () => {
  let service: MembersApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MembersApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(MembersApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('listMembers()', () => {
    it('issues a GET to /project/{id}/members', () => {
      service.listMembers(PROJECT_ID).subscribe();
      const req = httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, message: null, errors: [], data: [] } satisfies MembersListResponse);
    });

    it('unwraps { success: true, data: [...] } to the member array', () => {
      const fixture = [makeMember({ userId: 'u-1' }), makeMember({ userId: 'u-2', name: 'Bob' })];
      let emitted: MemberSummary[] | undefined;
      service.listMembers(PROJECT_ID).subscribe(m => (emitted = m));

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush({ success: true, message: null, errors: [], data: fixture } satisfies MembersListResponse);

      expect(emitted).toEqual(fixture);
    });

    it('emits [] when data is null', () => {
      let emitted: MemberSummary[] | undefined;
      service.listMembers(PROJECT_ID).subscribe(m => (emitted = m));

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush({ success: true, message: null, errors: [], data: null } satisfies MembersListResponse);

      expect(emitted).toEqual([]);
    });

    it('projects envelope { success: false } into an observable error', () => {
      let caught: unknown;
      service.listMembers(PROJECT_ID).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush({ success: false, message: 'boom', errors: ['bad'], data: null } satisfies MembersListResponse);

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('bad');
    });

    it('surfaces HTTP errors through the error branch', () => {
      let caught: unknown;
      service.listMembers(PROJECT_ID).subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush({ success: false, message: null, errors: [], data: null }, { status: 500, statusText: 'Server Error' });

      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('addMemberByEmail()', () => {
    it('issues a POST with the { email } body', () => {
      service.addMemberByEmail(PROJECT_ID, 'new@example.com').subscribe();
      const req = httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'new@example.com' });
      req.flush({ success: true, message: null, errors: [], data: makeMember() } satisfies AddMemberResponse);
    });

    it('unwraps { success: true, data: MemberSummary }', () => {
      const created = makeMember({ userId: 'u-new', name: 'New' });
      let emitted: MemberSummary | undefined;
      service.addMemberByEmail(PROJECT_ID, 'new@example.com').subscribe(m => (emitted = m));

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush({ success: true, message: null, errors: [], data: created } satisfies AddMemberResponse);

      expect(emitted).toEqual(created);
    });

    it('throws when data is null despite success: true', () => {
      let caught: unknown;
      service.addMemberByEmail(PROJECT_ID, 'e@example.com').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });

      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members`)
        .flush({ success: true, message: null, errors: [], data: null } satisfies AddMemberResponse);

      expect(caught).toBeInstanceOf(Error);
    });
  });

  describe('removeMember()', () => {
    it('issues a DELETE to /project/{id}/members/{userId}', () => {
      let completed = false;
      service.removeMember(PROJECT_ID, 'u-1').subscribe({ complete: () => (completed = true) });
      const req = httpMock.expectOne(`${BASE_URL}/${PROJECT_ID}/members/u-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(completed).toBe(true);
    });

    it('surfaces a 404 through the error branch (state layer tolerates it)', () => {
      let caught: unknown;
      service.removeMember(PROJECT_ID, 'u-1').subscribe({
        next: () => {
          /* unreachable */
        },
        error: err => (caught = err)
      });
      httpMock
        .expectOne(`${BASE_URL}/${PROJECT_ID}/members/u-1`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      expect(caught).toBeInstanceOf(HttpErrorResponse);
    });
  });
});

describe('mapMemberErrorToUserMessage()', () => {
  function makeHttpError(status: number, body: unknown = null): HttpErrorResponse {
    return new HttpErrorResponse({ status, statusText: 'x', url: '/api/project', error: body });
  }

  describe('list', () => {
    it('network error (status 0)', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(0), 'list')).toBe(
        "We couldn't reach the server. Please check your connection and try again."
      );
    });
    it('401 session expired', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(401), 'list')).toBe(
        'Your session has expired. Please sign in again.'
      );
    });
    it('404 project no longer exists', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(404), 'list')).toBe(
        'This project no longer exists.'
      );
    });
    it('5xx server error', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(500), 'list')).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
    });
    it('other 4xx -> generic list copy', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(418), 'list')).toBe(
        "We couldn't load the member list. Please try again."
      );
    });
  });

  describe('add', () => {
    it('network error', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(0), 'add')).toBe(
        "We couldn't reach the server. Please check your connection and try again."
      );
    });
    it('400 "User not found."', () => {
      expect(
        mapMemberErrorToUserMessage(
          makeHttpError(400, { errors: ['User not found.'], message: null }),
          'add'
        )
      ).toBe("We couldn't find a user with that email.");
    });
    it('400 "No user found with email address: foo@bar.com" (prefix match)', () => {
      expect(
        mapMemberErrorToUserMessage(
          makeHttpError(400, { errors: ['No user found with email address: foo@bar.com'], message: null }),
          'add'
        )
      ).toBe("We couldn't find a user with that email.");
    });
    it('400 "User is already a member of this project."', () => {
      expect(
        mapMemberErrorToUserMessage(
          makeHttpError(400, { errors: ['User is already a member of this project.'], message: null }),
          'add'
        )
      ).toBe('That user is already a member of this project.');
    });
    it('400 guardrail "Either UserId or Email is required." -> "Please enter an email."', () => {
      expect(
        mapMemberErrorToUserMessage(
          makeHttpError(400, { errors: ['Either UserId or Email is required.'], message: null }),
          'add'
        )
      ).toBe('Please enter an email.');
    });
    it('400 other -> generic add copy', () => {
      expect(
        mapMemberErrorToUserMessage(
          makeHttpError(400, { errors: ['Provide either UserId or Email, not both.'], message: null }),
          'add'
        )
      ).toBe("We couldn't add that member. Please check the email and try again.");
    });
    it('401 session expired', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(401), 'add')).toBe(
        'Your session has expired. Please sign in again.'
      );
    });
    it('403 only owner can add', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(403), 'add')).toBe(
        'Only the project owner can add members.'
      );
    });
    it('404 project no longer exists', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(404), 'add')).toBe(
        'This project no longer exists.'
      );
    });
    it('5xx server error', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(503), 'add')).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
    });
    it('plain Error "User not found." also maps to specific copy', () => {
      expect(mapMemberErrorToUserMessage(new Error('User not found.'), 'add')).toBe(
        "We couldn't find a user with that email."
      );
    });
    it('plain Error with prefix also maps', () => {
      expect(
        mapMemberErrorToUserMessage(new Error('No user found with email address: x@y.com'), 'add')
      ).toBe("We couldn't find a user with that email.");
    });
  });

  describe('remove', () => {
    it('network error', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(0), 'remove')).toBe(
        "We couldn't reach the server. Please check your connection and try again."
      );
    });
    it('400 "Cannot remove the last owner from the project."', () => {
      expect(
        mapMemberErrorToUserMessage(
          makeHttpError(400, { errors: ['Cannot remove the last owner from the project.'], message: null }),
          'remove'
        )
      ).toBe("You can't remove the last owner of a project.");
    });
    it('400 other -> generic remove copy', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(400), 'remove')).toBe(
        "We couldn't remove that member. Please try again."
      );
    });
    it('401 session expired', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(401), 'remove')).toBe(
        'Your session has expired. Please sign in again.'
      );
    });
    it('403 only owner can remove', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(403), 'remove')).toBe(
        'Only the project owner can remove members.'
      );
    });
    it('5xx server error', () => {
      expect(mapMemberErrorToUserMessage(makeHttpError(500), 'remove')).toBe(
        'Something went wrong on our end. Please try again in a moment.'
      );
    });
    it('plain Error last-owner also maps', () => {
      expect(
        mapMemberErrorToUserMessage(new Error('Cannot remove the last owner from the project.'), 'remove')
      ).toBe("You can't remove the last owner of a project.");
    });
  });
});
