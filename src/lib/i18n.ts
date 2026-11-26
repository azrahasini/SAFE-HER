import type { SupportedLanguage } from '../types/safeher.ts';

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  ta: 'தமிழ் (Tamil)',
  hi: 'हिन्दी (Hindi)',
  es: 'Español',
  fr: 'Français',
};

interface Dictionary {
  navHome: string;
  navMap: string;
  navAi: string;
  navEvidence: string;
  navProfile: string;
  sosButton: string;
  sosSubtitle: string;
  safetyStatusProtected: string;
  safetyStatusTest: string;
  safetyStatusActive: string;
  aiCardTitle: string;
  aiCardDesc: string;
  lockScreenBtn: string;
}

const DICTIONARIES: Record<SupportedLanguage, Dictionary> = {
  en: {
    navHome: 'Home',
    navMap: 'Map',
    navAi: 'AI Agent',
    navEvidence: 'Evidence',
    navProfile: 'Profile',
    sosButton: 'SOS Emergency',
    sosSubtitle: 'One-tap location, contact alerts & authorized evidence capture',
    safetyStatusProtected: 'Protected · Monitoring Ready',
    safetyStatusTest: 'Test Mode Active · No Real Alerts Sent',
    safetyStatusActive: 'Emergency SOS Active',
    aiCardTitle: 'AI Safety Agent',
    aiCardDesc: 'Situation-based escape guidance, voice input, and discreet help.',
    lockScreenBtn: 'Lock Screen',
  },
  ta: {
    navHome: 'முகப்பு',
    navMap: 'வரைபடம்',
    navAi: 'AI உதவியாளர்',
    navEvidence: 'ஆதாரம்',
    navProfile: 'சுயவிவரம்',
    sosButton: 'SOS அவசரம்',
    sosSubtitle: 'ஒரு தட்டில் இடம் பகிர்வு, தொடர்பு எச்சரிக்கை & பதிவு',
    safetyStatusProtected: 'பாதுகாப்பு தயார் நிலையில்',
    safetyStatusTest: 'சோதனை முறை · உண்மை எச்சரிக்கை இல்லை',
    safetyStatusActive: 'SOS அவசர நிலை செயல்பாட்டில்',
    aiCardTitle: 'AI பாதுகாப்பு உதவியாளர்',
    aiCardDesc: 'சூழ்நிலைக்கேற்ற பாதுகாப்பு வழிகாட்டுதல் மற்றும் குரல் உதவி.',
    lockScreenBtn: 'பூட்டுத் திரை',
  },
  hi: {
    navHome: 'होम',
    navMap: 'मैप',
    navAi: 'AI एजेंट',
    navEvidence: 'साक्ष्य',
    navProfile: 'प्रोफ़ाइल',
    sosButton: 'SOS आपातकाल',
    sosSubtitle: 'एक टैप में लोकेशन, संपर्क अलर्ट और रिकॉर्डिंग',
    safetyStatusProtected: 'सुरक्षित · निगरानी तैयार',
    safetyStatusTest: 'टेस्ट मोड सक्रिय · कोई वास्तविक अलर्ट नहीं',
    safetyStatusActive: 'SOS आपातकाल सक्रिय',
    aiCardTitle: 'AI सुरक्षा एजेंट',
    aiCardDesc: 'परिस्थिति-आधारित सुरक्षित निकास योजना और त्वरित सहायता।',
    lockScreenBtn: 'लॉक स्क्रीन',
  },
  es: {
    navHome: 'Inicio',
    navMap: 'Mapa',
    navAi: 'Agente IA',
    navEvidence: 'Evidencia',
    navProfile: 'Perfil',
    sosButton: 'SOS Emergencia',
    sosSubtitle: 'Ubicación, alertas a contactos y grabación autorizada en un toque',
    safetyStatusProtected: 'Protegida · Listo para asistir',
    safetyStatusTest: 'Modo de prueba activo · Sin alertas reales',
    safetyStatusActive: 'Emergencia SOS activa',
    aiCardTitle: 'Agente de Seguridad IA',
    aiCardDesc: 'Guía de escape según la situación y ayuda discreta.',
    lockScreenBtn: 'Bloqueo',
  },
  fr: {
    navHome: 'Accueil',
    navMap: 'Carte',
    navAi: 'Agent IA',
    navEvidence: 'Preuves',
    navProfile: 'Profil',
    sosButton: 'SOS Urgence',
    sosSubtitle: 'Position, alertes aux contacts et enregistrement en un geste',
    safetyStatusProtected: 'Protégée · Prête',
    safetyStatusTest: 'Mode test actif · Aucune alerte réelle',
    safetyStatusActive: 'Urgence SOS active',
    aiCardTitle: 'Agent Sécurité IA',
    aiCardDesc: 'Plan de mise en sécurité adapté et assistance discrète.',
    lockScreenBtn: 'Écran verrouillé',
  },
};

export function t(lang: SupportedLanguage): Dictionary {
  return DICTIONARIES[lang] || DICTIONARIES.en;
}
