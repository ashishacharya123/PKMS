# Iframe Authentication Issue: Comprehensive Analysis and Solution Plan

## Executive Summary

The PKMS application experiences a critical issue where document previews fail to load in iframe modals, displaying the error: `Refused to display 'http://localhost:8000/' in a frame because it set 'X-Frame-Options' to 'sameorigin'`. While "Open in new tab" functionality works perfectly, iframe-based inline previews consistently fail due to authentication cookie transmission issues. This document provides a detailed analysis of the root cause, current implementation state, and a comprehensive solution plan.

---

## Problem Statement

### Symptom
When users attempt to preview documents (PDFs, images, text files) in the inline modal iframe, the following error occurs:

```
chrome-error://chromewebdata/:1  Refused to display 'http://localhost:8000/' in a frame because it set 'X-Frame-Options' to 'sameorigin'.
```

### Impact
- **User Experience**: Users cannot preview documents inline within the application
- **Workaround Available**: "Open in new tab" functionality works, but breaks the intended UX flow
- **Consistency**: Issue affects all file types (PDFs, images, text files) across all modules (documents, diary, projects, notes)
- **Security**: Backend security headers are correctly configured, but authentication fails in iframe context

### Working vs. Failing Scenarios

**✅ Working**: Opening document in new tab
- URL: `http://localhost:8000/api/v1/documents/{uuid}/download?preview=true`
- Authentication: HttpOnly cookie (`pkms_token`) automatically sent by browser
- Result: Document loads successfully with proper headers

**❌ Failing**: Loading document in iframe modal
- URL: `http://localhost:8000/api/v1/documents/{uuid}/download?preview=true`
- Authentication: HttpOnly cookie not transmitted in iframe context
- Result: Authentication fails → Redirect to base URL → X-Frame-Options error

---

## Root Cause Analysis

### Primary Issue: HttpOnly Cookie Limitation

The application uses HttpOnly cookies for authentication security (XSS protection). However, HttpOnly cookies cannot be accessed by JavaScript, which prevents the frontend from extracting the token and adding it to iframe URLs as a query parameter.

**Current Authentication Flow:**

```python
# pkms-backend/app/routers/auth.py (lines 140-144)
response.set_cookie(
    key="pkms_token",
    value=access_token,
    max_age=settings.access_token_expire_minutes * 60,
    httponly=True,  # ❌ Cannot be read by JavaScript
    secure=(settings.environment == "production"),
    samesite="strict"  # ❌ Too restrictive for iframes
)
```

### Secondary Issue: Browser Iframe Cookie Policy

Modern browsers apply strict SameSite cookie policies to iframe contexts. Even when cookies are available, browsers may block them from being sent in iframe requests due to:

1. **SameSite=Strict Policy**: Prevents cookies from being sent in cross-site iframe contexts
2. **Browser Security**: Iframes are treated as potentially untrusted content
3. **Cookie Isolation**: Each iframe request is evaluated independently for cookie transmission

### Authentication Failure Chain

1. **Iframe Request Initiated**: Frontend sets iframe `src` to document download URL
2. **Cookie Transmission Fails**: Browser doesn't send HttpOnly cookie in iframe request
3. **Backend Authentication Fails**: No valid token received → 401 Unauthorized
4. **Redirect Occurs**: Backend redirects to base URL (`http://localhost:8000/`)
5. **X-Frame-Options Error**: Base URL has `X-Frame-Options: SAMEORIGIN` → Browser blocks iframe

### Evidence from Debug Logs

```
🔍 DEBUG: Cookie token found: null
🔍 DEBUG: addTokenToUrl called with: {url: '...', hasProvidedToken: false}
🔍 DEBUG: No token available, returning original URL
🔍 DEBUG: Iframe loaded successfully: [URL]
chrome-error://chromewebdata/:1  Refused to display 'http://localhost:8000/' in a frame...
```

The logs confirm:
- Token extraction fails (`null`)
- URL is generated without token parameter
- Iframe "loads" but content redirects to base URL
- Browser security policy blocks the redirected content

---

## Current Implementation State

### Backend Implementation ✅

The backend has been partially updated to support iframe authentication:

#### 1. Token Parameter Support

```python
# pkms-backend/app/auth/dependencies.py (lines 22-56)
async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token_cookie: str | None = Cookie(default=None, alias="pkms_token"),
    token_query: str | None = Query(default=None, alias="token"),  # ✅ URL parameter support
    credentials: HTTPAuthorizationCredentials | None = Depends(security)
) -> User:
    # Try cookie first (preferred, XSS-safe)
    token = token_cookie
    
    # Check URL parameter for preview requests (iframe support)
    if not token and token_query:
        # Only allow URL parameter for preview requests to maintain security
        is_preview_request = (
            request.url.path.endswith("/download") and
            request.query_params.get("preview", "").lower() == "true"
        )
        if is_preview_request:
            token = token_query  # ✅ Accepts token from URL parameter
```

#### 2. Non-HttpOnly Access Token Cookie

```python
# pkms-backend/app/routers/auth.py (lines 146-154)
# Set additional access token for iframe usage (non-HttpOnly)
response.set_cookie(
    key="pkms_access_token",
    value=access_token,
    max_age=settings.access_token_expire_minutes * 60,
    httponly=False,  # ✅ Allows JavaScript access
    secure=(settings.environment == "production"),
    samesite="lax"  # ⚠️ May still be too restrictive
)
```

#### 3. Security Headers Configuration

```python
# pkms-backend/main.py (lines 311-334)
if is_preview_request:
    # Remove X-Frame-Options to allow iframe embedding
    # Add frame-ancestors permission for inline preview
    if settings.environment == "production":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self'; "
            "frame-ancestors 'self' *; "  # ✅ Allows iframe embedding
            "object-src 'self'"
        )
    elif settings.environment == "development":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self'; "
            "frame-ancestors 'self' *; "  # ✅ Allows iframe embedding
            "object-src 'self'"
        )
```

### Frontend Implementation ✅

The frontend has been updated to extract tokens and add them to URLs:

#### 1. Cookie Utility Functions

```typescript
// pkms-frontend/src/utils/cookieUtils.ts
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null; // Server-side rendering
  }
  
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  
  if (parts.length === 2) {
    const cookieValue = parts.pop()?.split(';').shift();
    return cookieValue || null;
  }
  
  return null;
}

export function getCurrentAuthToken(): string | null {
  const token = getCookie('pkms_access_token'); // ✅ Uses non-HttpOnly cookie
  console.log('🔍 DEBUG: Access token found:', token ? `${token.substring(0, 20)}...` : 'null');
  return token;
}

export function addTokenToUrl(url: string, token?: string): string {
  const authToken = token || getCurrentAuthToken();
  
  console.log('🔍 DEBUG: addTokenToUrl called with:', { url, hasProvidedToken: !!token });
  
  if (!authToken) {
    console.log('🔍 DEBUG: No token available, returning original URL');
    return url; // No token available
  }
  
  // Ensure URL has proper query parameter format
  const separator = url.includes('?') ? '&' : '?';
  const urlWithToken = `${url}${separator}token=${encodeURIComponent(authToken)}`;
  console.log('🔍 DEBUG: URL with token:', urlWithToken.substring(0, 100) + '...');
  return urlWithToken;
}
```

#### 2. Iframe URL Generation

```typescript
// pkms-frontend/src/pages/DocumentsPage.tsx (lines 409-419)
// 3. All other file types (PDF, text, office docs, etc.): Use preview URL for inline iframe display
try {
  const url = getDownloadUrl(doc.uuid, true); // preview=true
  const urlWithToken = addTokenToUrl(url); // ✅ Add authentication token for iframe
  console.log('🔍 DEBUG: Modal iframe URL being generated:', urlWithToken);
  console.log('🔍 DEBUG: Document being previewed:', { uuid: doc.uuid, name: doc.originalName, type: doc.mimeType });
  contentModal.openModal(
    { file: doc, mode: 'view' },
    { content: null, pdfUrl: urlWithToken } // ✅ pdfUrl includes token parameter
  );
  console.log('🔍 DEBUG: Modal opened with pdfUrl:', urlWithToken);
} catch (error) {
  console.warn('Failed to get preview URL, opening in new tab:', error);
  openDownloadUrlInNewTab(true);
}
```

#### 3. Iframe Component

```typescript
// pkms-frontend/src/pages/DocumentsPage.tsx (lines 1056-1070)
<iframe
  src={contentModal.modalData.pdfUrl}  // ✅ URL includes token parameter
  style={{
    width: '100%',
    height: '100%',
    border: 'none'
  }}
  title={contentModal.selectedItem.file.originalName}
  onLoad={() => console.log('🔍 DEBUG: Iframe loaded successfully:', contentModal.modalData.pdfUrl)}
  onError={() => {
    console.error('🔍 DEBUG: Iframe failed to load:', contentModal.modalData.pdfUrl);
    console.log('🔍 DEBUG: Falling back to new tab for document');
    handlePreview(contentModal.selectedItem.file, true); // Open in new tab as fallback
  }}
/>
```

### Implementation Gaps ❌

Despite the infrastructure being in place, the following issues prevent it from working:

1. **Cookie SameSite Policy**: `samesite="lax"` may still block cookies in iframe contexts
2. **Cookie Availability**: Users need to log out and log back in to receive the new `pkms_access_token` cookie
3. **Development Environment**: SameSite policies behave differently in development vs. production
4. **Token Extraction**: Debug logs show `null` token, indicating cookie isn't being read properly

---

## Solution Plan

### Phase 1: Fix Cookie SameSite Policy

**Problem**: The `samesite="lax"` policy may still prevent cookies from being sent in iframe requests.

**Solution**: Update the cookie policy to `samesite="none"` with `secure=True` for better iframe compatibility. In development, we can use `samesite="lax"` with `secure=False`, but production requires `samesite="none"` with `secure=True` (HTTPS).

**Implementation**:

```python
# pkms-backend/app/routers/auth.py
# Update lines 146-154
response.set_cookie(
    key="pkms_access_token",
    value=access_token,
    max_age=settings.access_token_expire_minutes * 60,
    httponly=False,  # Allow JavaScript access
    secure=(settings.environment == "production"),  # HTTPS required in production
    samesite="none" if settings.environment == "production" else "lax"  # ✅ Better iframe support
)
```

**Security Note**: `samesite="none"` requires `secure=True`, which means HTTPS is mandatory in production. This is acceptable as production should always use HTTPS.

### Phase 2: Add Cookie Refresh Mechanism

**Problem**: Existing logged-in users don't have the `pkms_access_token` cookie until they log out and log back in.

**Solution**: Add a mechanism to refresh the access token cookie on existing sessions.

**Implementation Options**:

**Option A: Refresh on Token Validation**
- When the backend validates a request with `pkms_token` cookie, also set `pkms_access_token` cookie
- This ensures all authenticated users get the new cookie automatically

**Option B: Frontend Cookie Check**
- Frontend checks for `pkms_access_token` cookie on app load
- If missing, makes a request to refresh the cookie
- Backend endpoint sets the cookie based on existing `pkms_token`

**Recommended: Option A** - Automatic and transparent to users.

```python
# pkms-backend/app/auth/dependencies.py
# Add to get_current_user function after successful authentication
async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token_cookie: str | None = Cookie(default=None, alias="pkms_token"),
    token_query: str | None = Query(default=None, alias="token"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security)
) -> User:
    # ... existing authentication logic ...
    
    # After successful authentication, ensure access token cookie exists
    if token_cookie and not request.cookies.get("pkms_access_token"):
        # User is authenticated but missing access token cookie
        # This will be set in the response middleware or endpoint
        pass  # Cookie will be set by response modification
    
    return user
```

**Better Approach**: Set cookie in response middleware when `pkms_token` exists but `pkms_access_token` doesn't:

```python
# pkms-backend/main.py
# Add to add_security_headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)
    
    # Ensure access token cookie exists if main token exists
    if request.cookies.get("pkms_token") and not request.cookies.get("pkms_access_token"):
        # Extract token from cookie
        token = request.cookies.get("pkms_token")
        if token:
            # Set access token cookie in response
            response.set_cookie(
                key="pkms_access_token",
                value=token,
                max_age=settings.access_token_expire_minutes * 60,
                httponly=False,
                secure=(settings.environment == "production"),
                samesite="none" if settings.environment == "production" else "lax"
            )
    
    # ... existing security headers logic ...
    
    return response
```

### Phase 3: Enhanced Error Handling and Fallback

**Problem**: When token extraction fails, the iframe still attempts to load without authentication, leading to confusing errors.

**Solution**: Improve error handling to provide better user feedback and automatic fallback.

**Implementation**:

```typescript
// pkms-frontend/src/pages/DocumentsPage.tsx
// Update handlePreview function
const handlePreview = async (doc: Document, openInNewTab: boolean = false) => {
  try {
    // ... existing file type checks ...
    
    // 3. All other file types: Use preview URL for inline iframe display
    try {
      const url = getDownloadUrl(doc.uuid, true); // preview=true
      const token = getCurrentAuthToken();
      
      if (!token) {
        // ✅ No token available - show user-friendly message and fallback
        console.warn('Access token not available for iframe preview');
        notifications.show({
          title: 'Preview Unavailable',
          message: 'Opening in new tab instead. Please refresh the page if this persists.',
          color: 'yellow'
        });
        openDownloadUrlInNewTab(true);
        return;
      }
      
      const urlWithToken = addTokenToUrl(url, token);
      console.log('🔍 DEBUG: Modal iframe URL being generated:', urlWithToken);
      
      contentModal.openModal(
        { file: doc, mode: 'view' },
        { content: null, pdfUrl: urlWithToken }
      );
    } catch (error) {
      console.warn('Failed to get preview URL, opening in new tab:', error);
      openDownloadUrlInNewTab(true);
    }
  } catch (error) {
    console.error('Preview error:', error);
    notifications.show({
      title: 'Preview failed',
      message: 'Could not load preview. Try downloading instead.',
      color: 'red'
    });
  }
};
```

### Phase 4: Comprehensive Testing Strategy

**Test Cases**:

1. **Fresh Login Test**
   - Log out completely
   - Log back in
   - Verify both `pkms_token` and `pkms_access_token` cookies are set
   - Attempt iframe preview → Should work

2. **Existing Session Test**
   - Use existing logged-in session
   - Navigate to documents page
   - Verify `pkms_access_token` cookie is automatically set
   - Attempt iframe preview → Should work

3. **Token Extraction Test**
   - Open browser console
   - Check debug logs for token extraction
   - Verify `🔍 DEBUG: Access token found:` shows token (not null)
   - Verify `🔍 DEBUG: URL with token:` includes `?token=...` parameter

4. **Multiple File Types Test**
   - Test PDF files
   - Test image files (PNG, JPG)
   - Test text files (TXT, MD)
   - Test JSON/XML files
   - All should work in iframe

5. **Cross-Module Test**
   - Test document previews
   - Test diary entry file previews
   - Test project file previews
   - Test note attachment previews

6. **Error Handling Test**
   - Simulate missing token (clear `pkms_access_token` cookie)
   - Verify fallback to new tab works
   - Verify user notification is shown

### Phase 5: Security Considerations

**Security Measures Already in Place**:

1. **Token Parameter Restriction**: Backend only accepts `token` parameter for preview requests (`preview=true`)
2. **HttpOnly Main Cookie**: Primary authentication still uses HttpOnly cookie (XSS protection)
3. **Token Expiration**: Access token expires with same timeframe as main token
4. **URL Encoding**: Token is properly URL-encoded when added to URLs

**Additional Security Recommendations**:

1. **Token Validation**: Backend validates token signature and expiration
2. **HTTPS in Production**: `samesite="none"` requires HTTPS (already enforced)
3. **Token Scope**: Access token should only work for preview endpoints (already implemented)
4. **Logging**: Monitor for unusual token usage patterns

---

## Implementation Checklist

### Backend Changes

- [ ] Update `pkms_access_token` cookie SameSite policy in `auth.py`
  - Change `samesite="lax"` to conditional: `"none"` in production, `"lax"` in development
  - Ensure `secure=True` in production (requires HTTPS)
- [ ] Add cookie refresh mechanism in `main.py` middleware
  - Check if `pkms_token` exists but `pkms_access_token` doesn't
  - Automatically set `pkms_access_token` cookie in response
- [ ] Update logout function to clear `pkms_access_token` cookie
  - Already implemented, verify it works correctly
- [ ] Test backend changes with curl/Postman
  - Verify token parameter authentication works
  - Verify cookies are set correctly

### Frontend Changes

- [ ] Verify `cookieUtils.ts` is reading `pkms_access_token` correctly
  - Already implemented, verify with debug logs
- [ ] Enhance error handling in `DocumentsPage.tsx`
  - Add user-friendly notifications when token unavailable
  - Improve fallback mechanism
- [ ] Add token availability check before iframe load
  - Prevent iframe from loading if no token available
  - Show appropriate user message
- [ ] Remove debug logging after verification
  - Keep essential error logging
  - Remove verbose debug statements

### Testing

- [ ] Test fresh login scenario
- [ ] Test existing session scenario
- [ ] Test token extraction and URL generation
- [ ] Test all file types (PDF, images, text)
- [ ] Test across all modules (documents, diary, projects, notes)
- [ ] Test error handling and fallback
- [ ] Test in both development and production environments

### Documentation

- [ ] Update API documentation for token parameter
- [ ] Document cookie refresh mechanism
- [ ] Update troubleshooting guide
- [ ] Document security considerations

---

## Expected Outcomes

After implementing this solution:

1. **✅ Iframe Previews Work**: All file types load successfully in iframe modals
2. **✅ Automatic Cookie Refresh**: Existing users automatically get access token cookie
3. **✅ Better Error Handling**: Users receive clear feedback when preview fails
4. **✅ Consistent Behavior**: Same functionality across all modules
5. **✅ Security Maintained**: All security measures remain in place
6. **✅ Production Ready**: Solution works in both development and production environments

---

## Timeline Estimate

- **Phase 1 (Cookie Policy Fix)**: 30 minutes
- **Phase 2 (Cookie Refresh)**: 1-2 hours
- **Phase 3 (Error Handling)**: 1 hour
- **Phase 4 (Testing)**: 2-3 hours
- **Phase 5 (Documentation)**: 1 hour

**Total Estimated Time**: 5-7 hours

---

## Conclusion

The iframe authentication issue is caused by HttpOnly cookie limitations and browser SameSite policies. The solution involves updating cookie policies, adding automatic cookie refresh, and improving error handling. The infrastructure is already in place; we need to fine-tune the cookie configuration and add the refresh mechanism to make it work seamlessly for all users.

The implementation is straightforward and maintains all existing security measures while enabling the desired iframe preview functionality.

