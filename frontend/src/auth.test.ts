import { beforeEach, describe, expect, it, vi } from 'vitest';
const mockSession = { accessToken: 'test-token', expiresAt: '2099-01-01', user: { id: '1', email: 'profe@example.com' } };
beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });
describe('session transport', () => {
  it('deduplicates concurrent refresh and never persists tokens', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(mockSession)));
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const auth = await import('./auth');
    expect(await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()])).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({ credentials: 'include', headers: expect.objectContaining({ 'X-Requested-With': 'Profefacilisimo' }) }));
    expect(storage).not.toHaveBeenCalled();
  });
  it('renews once after a 401 and retries the protected request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockSession)))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockSession.user)));
    const auth = await import('./auth');
    expect(await auth.getCurrentUser()).toEqual(mockSession.user);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/me', expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }));
  });
  it('treats an expired refresh as signed out', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    const auth = await import('./auth');
    expect(await auth.refresh()).toBe(false);
  });
  it('does not claim logout succeeded on server failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    const auth = await import('./auth');
    await expect(auth.logout()).rejects.toThrow();
  });
});

