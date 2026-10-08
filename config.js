// ============================================================
//  CONFIGURAÇÃO DA AGENDA — o único arquivo que você precisa editar
// ============================================================

// 1) Chaves do Firebase
//    No Firebase: Configurações do projeto > Seus apps > ícone </> (Web)
//    Copie os valores que aparecem em "firebaseConfig" e cole aqui.
export const firebaseConfig = {
  apiKey: "AIzaSyCmJ_1DO5pi1m5UkIu21Vb0nyzTSZ7A-o4",
  authDomain: "minha-agenda-ecdef.firebaseapp.com",
  projectId: "minha-agenda-ecdef",
  storageBucket: "minha-agenda-ecdef.firebasestorage.app",
  messagingSenderId: "88788132956",
  appId: "1:88788132956:web:18c5153e954e9c502af299"
};

// 2) E-mail do dono da agenda (quem libera os acessos).
//    Precisa ser igual ao e-mail escrito no arquivo firestore.rules.
export const DONO_EMAIL = "junior.godeiro@icloud.com";

// 3) Nome que aparece no topo (você também pode mudar depois em Configurações).
export const NOME_PADRAO = "Minha Agenda";

// 4) E-mails automáticos (opcional) pelo EmailJS: aviso de novo pedido para você
//    e aviso de liberação para a pessoa. Deixe em branco para não usar.
export const EMAILJS = {
  publicKey: "",
  serviceId: "",
  templateId: ""
};
