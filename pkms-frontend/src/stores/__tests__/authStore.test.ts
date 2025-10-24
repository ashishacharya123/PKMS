import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../authStore';

describe('authStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.getState().logout();
  });

  it('should have initial state', () => {
    const state = useAuthStore.getState();
    
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('should login user', () => {
    const user = {
      uuid: 'test-uuid',
      username: 'testuser',
      email: 'test@example.com'
    };

    useAuthStore.getState().login(user);
    
    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
  });

  it('should logout user', () => {
    const user = {
      uuid: 'test-uuid',
      username: 'testuser',
      email: 'test@example.com'
    };

    // First login
    useAuthStore.getState().login(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // Then logout
    useAuthStore.getState().logout();
    
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should set loading state', () => {
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);

    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('should update user profile', () => {
    const user = {
      uuid: 'test-uuid',
      username: 'testuser',
      email: 'test@example.com'
    };

    useAuthStore.getState().login(user);
    
    const updatedUser = {
      ...user,
      email: 'updated@example.com'
    };

    useAuthStore.getState().updateUser(updatedUser);
    
    expect(useAuthStore.getState().user).toEqual(updatedUser);
  });
});
