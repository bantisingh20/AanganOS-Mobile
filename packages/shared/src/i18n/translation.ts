export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export interface Translation {
  common: {
    appName: string; tagline: string; login: string; createAccount: string; createAccountShort: string;
    newHere: string; forgotPassword: string; rememberMe: string; mobileNumber: string; password: string;
    welcomeBack: string; signInSubtitle: string; manageConnectLiveBetter: string;
  };
  features: { secureSociety: string; connectedResidents: string; easyManagement: string; greenerLiving: string };
  language: { title: string; choose: string };
  forgot: {
    title: string; subtitle: string; tabMobile: string; tabEmail: string;
    mobilePlaceholder: string; emailPlaceholder: string; sendOtp: string; secureNote: string;
    verifyTitle: string; otpSentTo: string; didntReceive: string; resendIn: string; resend: string; verifyOtp: string;
    resetTitle: string; resetSubtitle: string; newPassword: string; confirmPassword: string; resetPassword: string;
    ruleLength: string; ruleNumber: string; ruleUppercase: string; ruleSpecial: string; passwordsDoNotMatch: string;
    successTitle: string; successMessage: string; backToLogin: string;
  };
  register: {
    createTitle: string; createSubtitle: string;
    selectSociety: string; societyPlaceholder: string; searching: string; society: string; change: string;
    towerBlock: string; towerPlaceholder: string; unit: string; unitPlaceholder: string;
    noUnitsTower: string; noUnitsSociety: string;
    residentType: string; owner: string; tenant: string; familyMember: string;
    moveInDate: string; selectDate: string;
    haveAccount: string; logIn: string; next: string;
    mobileTitle: string; mobileSubtitle: string; mobileNumber: string; mobilePlaceholder: string; sendOtp: string;
    otpTitle: string; otpSentTo: string; didntReceive: string; resendIn: string; resend: string; verifyOtp: string; enterCode: string;
    selfieTitle: string; selfieSubtitle: string; goodLighting: string; lookStraight: string; removeMask: string; takePhoto: string;
    previewTitle: string; previewSubtitle: string; faceVisible: string; goodLightingRule: string; noMask: string; notBlurred: string; retake: string; usePhoto: string;
    personalTitle: string; personalSubtitle: string; fullName: string; fullNamePlaceholder: string; emailOptional: string; emailPlaceholder: string; dateOfBirth: string; gender: string; male: string; female: string; other: string; password: string; passwordPlaceholder: string;
    idTitle: string; idSubtitle: string; selectIdType: string; idTypePlaceholder: string; aadhaar: string; pan: string; passport: string; drivingLicense: string; frontSide: string; backSide: string; upload: string; secureNote: string; createAccount: string;
    doneTitle: string; doneSubtitle: string; name: string; unitSummary: string; memberType: string; goToHome: string;
    kycTitle: string; kycDoneTitle: string; kycDoneSubtitle: string; kycDoneBack: string; completeVerification: string; completeVerificationSub: string;
  };
}
