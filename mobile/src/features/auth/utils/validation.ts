export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isStrongPassword(password: string) {
  return password.trim().length >= 8;
}

export function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10;
}

export function validateAuthName(fullName: string) {
  return fullName.trim().length >= 3 ? null : 'Enter your full name.';
}

export function validateAuthEmail(email: string) {
  return isValidEmail(email) ? null : 'Enter a valid email address.';
}

export function validateAuthPhone(phone: string) {
  return isValidPhone(phone) ? null : 'Enter a valid phone number.';
}

export function validateAuthPassword(password: string) {
  return isStrongPassword(password) ? null : 'Password must be at least 8 characters.';
}

export function validateAuthOtp(otp: string) {
  return /^\d{6}$/.test(otp.trim()) ? null : 'Enter the 6-digit verification code.';
}

export function validateConfirmPassword(password: string, confirmPassword: string) {
  return password === confirmPassword ? null : 'Passwords do not match.';
}