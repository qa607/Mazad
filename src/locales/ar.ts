import type { Translations } from './en';

/** Arabic UI strings. Typed against en.ts, so a missing key fails type checking. */
export const ar: Translations = {
  login: 'تسجيل الدخول',
  forgotPassword: 'هل نسيت كلمة المرور؟',
  createAccount: 'إنشاء حساب جديد',
  send: 'أرسل',
  verify: 'تحقق',
  saveAndLogin: 'حفظ وتسجيل الدخول',
  cookieDecline: 'رفض',
  resetPasswordHeading: 'إعادة تعيين كلمة المرور',
  otpVerificationHeading: 'التحقق من رقم الجوال',
  newPasswordHeading: 'إنشاء كلمة مرور جديدة',
  invalidCredentials: 'المعلومات المدخلة غير صحيحة، يرجى التأكد منها والمحاولة مرة أخرى',
  unregisteredPhone: 'رقم الجوال المدخل غير مسجل',
  incorrectOtp: 'الرمز المُدخل غير صحيح',
  passwordTooShort: 'يجب أن تتكون كلمة المرور من 6 خانات على الأقل',
  logout: 'تسجيل الخروج',
  headerGuestPrompt: 'إنشاء حساب / تسجيل الدخول',
};
