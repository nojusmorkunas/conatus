// The Android app's private-use URI scheme (RFC 8252 section 7.1), kept free
// of imports because proxy.ts reads it.
export const nativeAppScheme = "com.useconatus.app";
export const nativeAppRedirect = `${nativeAppScheme}:/auth`;
