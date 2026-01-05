import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// [추가됨] 스토리지 기능을 가져오는 코드
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDbVG3iL3FBJe6alPLZnhFW_QAGpzeqFoY",
  authDomain: "namhwa-safety-dashboard.firebaseapp.com",
  projectId: "namhwa-safety-dashboard",
  // 버킷 주소는 아주 정확하게 잘 적으셨습니다!
  storageBucket: "namhwa-safety-dashboard.firebasestorage.app",
  messagingSenderId: "152864778612",
  appId: "1:152864778612:web:ecc482adce93a1534a2421"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// [추가됨] 앱에 스토리지를 연결하고 내보내기
export const storage = getStorage(app);