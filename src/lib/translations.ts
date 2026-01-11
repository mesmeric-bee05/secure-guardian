// Translations for MediReach+ (English and Swahili)

export type Language = 'en' | 'sw';

export const translations = {
  en: {
    // App
    appName: 'MediReach+',
    appTagline: 'Your AI-powered health companion',
    
    // Navigation
    home: 'Home',
    chat: 'First Aid Chat',
    emergency: 'Emergency',
    dashboard: 'Dashboard',
    admin: 'Admin',
    profile: 'Profile',
    logout: 'Log Out',
    login: 'Log In',
    signup: 'Sign Up',
    
    // Auth
    welcomeBack: 'Welcome Back',
    createAccount: 'Create Account',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    fullName: 'Full Name',
    forgotPassword: 'Forgot password?',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    
    // Chat
    askQuestion: 'Describe your symptoms or ask a health question...',
    send: 'Send',
    voiceInput: 'Voice Input',
    stopListening: 'Stop Listening',
    clearChat: 'Clear Chat',
    disclaimer: 'This is first aid guidance only. For medical emergencies, call 999.',
    
    // Emergency
    findNearby: 'Find Nearby Facilities',
    emergencyAlert: 'Emergency Alert',
    callEmergency: 'Call Emergency Services',
    hospital: 'Hospital',
    clinic: 'Clinic',
    pharmacy: 'Pharmacy',
    healthCenter: 'Health Center',
    distance: 'Distance',
    getDirections: 'Get Directions',
    call: 'Call',
    open24Hours: 'Open 24 Hours',
    hasAmbulance: 'Ambulance Available',
    
    // Profile
    editProfile: 'Edit Profile',
    phoneNumber: 'Phone Number',
    bloodType: 'Blood Type',
    allergies: 'Allergies',
    medicalConditions: 'Medical Conditions',
    dateOfBirth: 'Date of Birth',
    preferredLanguage: 'Preferred Language',
    emergencyContacts: 'Emergency Contacts',
    addContact: 'Add Contact',
    relationship: 'Relationship',
    primaryContact: 'Primary Contact',
    
    // Dashboard (CHW)
    activeCases: 'Active Cases',
    pendingCases: 'Pending Cases',
    resolvedCases: 'Resolved Cases',
    assignedToMe: 'Assigned to Me',
    caseDetails: 'Case Details',
    updateStatus: 'Update Status',
    patientInfo: 'Patient Information',
    symptoms: 'Symptoms',
    location: 'Location',
    priority: 'Priority',
    status: 'Status',
    
    // Status
    pending: 'Pending',
    assigned: 'Assigned',
    inProgress: 'In Progress',
    resolved: 'Resolved',
    escalated: 'Escalated',
    
    // Priority
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
    
    // Actions
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    confirm: 'Confirm',
    back: 'Back',
    loading: 'Loading...',
    
    // Messages
    success: 'Success',
    error: 'Error',
    profileUpdated: 'Profile updated successfully',
    contactAdded: 'Emergency contact added',
    alertSent: 'Emergency alert sent. Help is on the way!',
    locationShared: 'Your location has been shared',
  },
  
  sw: {
    // App
    appName: 'MediReach+',
    appTagline: 'Mwenzako wa afya anayeendeshwa na AI',
    
    // Navigation
    home: 'Nyumbani',
    chat: 'Gumzo la Huduma ya Kwanza',
    emergency: 'Dharura',
    dashboard: 'Dashibodi',
    admin: 'Msimamizi',
    profile: 'Wasifu',
    logout: 'Ondoka',
    login: 'Ingia',
    signup: 'Jisajili',
    
    // Auth
    welcomeBack: 'Karibu Tena',
    createAccount: 'Unda Akaunti',
    email: 'Barua pepe',
    password: 'Nenosiri',
    confirmPassword: 'Thibitisha Nenosiri',
    fullName: 'Jina Kamili',
    forgotPassword: 'Umesahau nenosiri?',
    noAccount: 'Huna akaunti?',
    haveAccount: 'Una akaunti tayari?',
    
    // Chat
    askQuestion: 'Eleza dalili zako au uliza swali la afya...',
    send: 'Tuma',
    voiceInput: 'Ingizo la Sauti',
    stopListening: 'Acha Kusikiliza',
    clearChat: 'Futa Gumzo',
    disclaimer: 'Hii ni mwongozo wa huduma ya kwanza tu. Kwa dharura za kimatibabu, piga simu 999.',
    
    // Emergency
    findNearby: 'Tafuta Vituo vya Karibu',
    emergencyAlert: 'Tahadhari ya Dharura',
    callEmergency: 'Piga Huduma za Dharura',
    hospital: 'Hospitali',
    clinic: 'Kliniki',
    pharmacy: 'Duka la Dawa',
    healthCenter: 'Kituo cha Afya',
    distance: 'Umbali',
    getDirections: 'Pata Maelekezo',
    call: 'Piga',
    open24Hours: 'Wazi Masaa 24',
    hasAmbulance: 'Ambulensi Inapatikana',
    
    // Profile
    editProfile: 'Hariri Wasifu',
    phoneNumber: 'Nambari ya Simu',
    bloodType: 'Kundi la Damu',
    allergies: 'Mizio',
    medicalConditions: 'Hali za Kimatibabu',
    dateOfBirth: 'Tarehe ya Kuzaliwa',
    preferredLanguage: 'Lugha Inayopendelewa',
    emergencyContacts: 'Mawasiliano ya Dharura',
    addContact: 'Ongeza Mwasiliani',
    relationship: 'Uhusiano',
    primaryContact: 'Mwasiliani Mkuu',
    
    // Dashboard (CHW)
    activeCases: 'Kesi Zinazoendelea',
    pendingCases: 'Kesi Zinazosubiri',
    resolvedCases: 'Kesi Zilizokamilika',
    assignedToMe: 'Zilizopewa Mimi',
    caseDetails: 'Maelezo ya Kesi',
    updateStatus: 'Sasisha Hali',
    patientInfo: 'Taarifa za Mgonjwa',
    symptoms: 'Dalili',
    location: 'Mahali',
    priority: 'Kipaumbele',
    status: 'Hali',
    
    // Status
    pending: 'Inasubiri',
    assigned: 'Imepewa',
    inProgress: 'Inaendelea',
    resolved: 'Imekamilika',
    escalated: 'Imeongezwa',
    
    // Priority
    low: 'Chini',
    medium: 'Wastani',
    high: 'Juu',
    critical: 'Muhimu Sana',
    
    // Actions
    save: 'Hifadhi',
    cancel: 'Ghairi',
    delete: 'Futa',
    edit: 'Hariri',
    confirm: 'Thibitisha',
    back: 'Rudi',
    loading: 'Inapakia...',
    
    // Messages
    success: 'Imefanikiwa',
    error: 'Hitilafu',
    profileUpdated: 'Wasifu umesasishwa',
    contactAdded: 'Mwasiliani wa dharura ameongezwa',
    alertSent: 'Tahadhari ya dharura imetumwa. Msaada unakuja!',
    locationShared: 'Mahali pako pameshirikiwa',
  },
} as const;

export function t(key: keyof typeof translations.en, language: Language = 'en'): string {
  return translations[language][key] || translations.en[key] || key;
}
