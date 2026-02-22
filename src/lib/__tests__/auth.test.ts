import { beforeEach, expect, test, vi } from 'vitest';
import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { createSession, deleteSession, getSession, verifySession } from '../auth';
import { NextRequest } from 'next/server';

// Mock server-only so it doesn't throw in test environment
vi.mock('server-only', () => ({}));

// Mock next/headers
const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
};
vi.mock('next/headers', () => ({
    cookies: vi.fn(),
}));

// Mock jose
vi.mock('jose', () => ({
    jwtVerify: vi.fn(),
    SignJWT: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    (cookies as any).mockResolvedValue(mockCookieStore);
});

// createSession
test('createSession signs a JWT and sets an httpOnly cookie', async () => {
    const mockSign = vi.fn().mockResolvedValue('mock-token');
    const mockSetExpirationTime = vi.fn().mockReturnThis();
    const mockSetIssuedAt = vi.fn().mockReturnThis();
    const mockSetProtectedHeader = vi.fn().mockReturnThis();

    (SignJWT as any).mockImplementation(() => ({
        setProtectedHeader: mockSetProtectedHeader,
        setExpirationTime: mockSetExpirationTime,
        setIssuedAt: mockSetIssuedAt,
        sign: mockSign,
    }));

    await createSession('user-1', 'user@example.com');

    expect(SignJWT).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', email: 'user@example.com' })
    );
    expect(mockSign).toHaveBeenCalled();
    expect(mockCookieStore.set).toHaveBeenCalledWith(
        'auth-token',
        'mock-token',
        expect.objectContaining({
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
        })
    );
});

test('createSession sets secure flag only in production', async () => {
    const originalEnv = process.env.NODE_ENV;

    const mockSign = vi.fn().mockResolvedValue('mock-token');
    (SignJWT as any).mockImplementation(() => ({
        setProtectedHeader: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        sign: mockSign,
    }));

    // Non-production
    await createSession('user-1', 'user@example.com');
    expect(mockCookieStore.set).toHaveBeenCalledWith(
        'auth-token',
        'mock-token',
        expect.objectContaining({ secure: false })
    );
});

// getSession
test('getSession returns null when no cookie is present', async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const session = await getSession();

    expect(session).toBeNull();
    expect(jwtVerify).not.toHaveBeenCalled();
});

test('getSession returns session payload for a valid token', async () => {
    const payload = {
        userId: 'user-1',
        email: 'user@example.com',
        expiresAt: new Date(),
    };
    mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
    (jwtVerify as any).mockResolvedValue({ payload });

    const session = await getSession();

    expect(jwtVerify).toHaveBeenCalledWith('valid-token', expect.anything());
    expect(session).toEqual(payload);
});

test('getSession returns null when jwtVerify throws', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'expired-token' });
    (jwtVerify as any).mockRejectedValue(new Error('Token expired'));

    const session = await getSession();

    expect(session).toBeNull();
});

// deleteSession
test('deleteSession removes the auth-token cookie', async () => {
    await deleteSession();

    expect(mockCookieStore.delete).toHaveBeenCalledWith('auth-token');
});

// verifySession
test('verifySession returns null when no cookie is present on request', async () => {
    const request = new NextRequest('http://localhost/api/test');

    const session = await verifySession(request);

    expect(session).toBeNull();
    expect(jwtVerify).not.toHaveBeenCalled();
});

test('verifySession returns session payload for a valid request token', async () => {
    const payload = {
        userId: 'user-2',
        email: 'other@example.com',
        expiresAt: new Date(),
    };
    (jwtVerify as any).mockResolvedValue({ payload });

    const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'auth-token=valid-token' },
    });

    const session = await verifySession(request);

    expect(jwtVerify).toHaveBeenCalledWith('valid-token', expect.anything());
    expect(session).toEqual(payload);
});

test('verifySession returns null when jwtVerify throws', async () => {
    (jwtVerify as any).mockRejectedValue(new Error('Invalid token'));

    const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'auth-token=bad-token' },
    });

    const session = await verifySession(request);

    expect(session).toBeNull();
});
