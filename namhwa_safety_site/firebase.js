// 파일명: firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 제공해주신 설정값을 적용했습니다.
const firebaseConfig = {
  apiKey: "AIzaSyDbVG3iL3FBJe6alPLZnhFW_QAGpzeqFoY",
  authDomain: "namhwa-safety-dashboard.firebaseapp.com",
  projectId: "namhwa-safety-dashboard",
  storageBucket: "namhwa-safety-dashboard.firebasestorage.app",
  messagingSenderId: "152864778612",
  appId: "1:152864778612:web:ecc482adce93a1534a2421"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);