import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  doc,
  setDoc,
  deleteDoc,
  setLogLevel
} from 'firebase/firestore';

// --- (중요) Firebase 설정 및 App ID 초기화 ---
let firebaseConfig;
let appId = 'safety-check-demo-v1'; // 기본값

const isCanvasEnv = typeof __firebase_config !== 'undefined';

if (isCanvasEnv) {
  try {
    firebaseConfig = JSON.parse(__firebase_config);
  } catch (e) {
    console.error("Firebase Config 파싱 오류", e);
  }
  
  if (typeof __app_id !== 'undefined') {
    // Firestore 경로 오류 방지를 위해 특수문자를 밑줄(_)로 치환
    appId = __app_id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
} else {
  const env = typeof process !== 'undefined' && process.env ? process.env : {};
  firebaseConfig = {
    apiKey: env.VITE_API_KEY || "YOUR_API_KEY",
    authDomain: env.VITE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
    projectId: env.VITE_PROJECT_ID || "YOUR_PROJECT_ID",
    storageBucket: env.VITE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
    messagingSenderId: env.VITE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
    appId: env.VITE_APP_ID || "YOUR_APP_ID"
  };
}

// --- 앱 초기화 ---
let app;
let db;
let auth;

try {
  const isConfigValid = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");
  
  if (isConfigValid) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setLogLevel('warn'); 
  } else {
    console.warn("Firebase 설정이 완료되지 않았습니다.");
  }
} catch (error) {
  console.error("Firebase 초기화 오류:", error);
  db = null;
  auth = null;
}


// --- 상수 정의 ---
const SITES = [
  '현장 A', '현장 B', '현장 C', '현장 D', '현장 E',
  '현장 F', '현장 G', '현장 H', '현장 I', '현장 J', '현장 K'
];

const CATEGORIES = [
  {
    id: 'riskAssessment',
    name: '위험성평가',
    subCategories: [
      { id: 'ra_weekly', name: '1.1 주간 위험성평가 실시' },
      { id: 'ra_measures', name: '1.2 위험성감소대책 이행' },
      { id: 'ra_participation', name: '1.3 근로자 참여' },
    ]
  },
  {
    id: 'tbm',
    name: 'TBM (Tool Box Meeting)',
    subCategories: [
      { id: 'tbm_inspection', name: '2.1 작업전 안전점검' },
      { id: 'tbm_nearmiss', name: '2.2 안전제안/아차사고' },
    ]
  },
  {
    id: 'training',
    name: '안전보건교육',
    subCategories: [
      { id: 'tr_new', name: '3.1 신규채용자교육' },
      { id: 'tr_change', name: '3.2 작업내용 변경교육' },
      { id: 'tr_special', name: '3.3 특별안전교육' },
      { id: 'tr_regular_worker', name: '3.4 정기안전교육(근로자)' },
      { id: 'tr_regular_manager', name: '3.5 정기안전교육(관리감독자)' },
    ]
  },
  {
    id: 'inspection',
    name: '안전점검',
    subCategories: [
      { id: 'insp_joint', name: '4.1 합동안전점검' },
      { id: 'insp_owner', name: '4.2 사업주 순회점검' },
      { id: 'insp_manager', name: '4.3 관리감독자 순회점검' },
      { id: 'insp_safety', name: '4.4 안전관리자 순회점검' },
      { id: 'insp_followup', name: '4.5 점검 후속조치(지적사항)' },
    ]
  },
  {
    id: 'contractor',
    name: '도급/협력사 관리',
    subCategories: [
      { id: 'cont_council', name: '5.1 안전보건협의체' },
      { id: 'cont_ptw', name: '5.2 위험작업허가(PTW)' },
      { id: 'cont_plan', name: '5.3 작업계획수립' },
    ]
  },
  {
    id: 'emergency',
    name: '비상대응',
    subCategories: [
      { id: 'em_check', name: '6.1 비상자재 재고 점검' },
      { id: 'em_drill', name: '6.2 비상대응훈련' },
    ]
  },
];

// --- 헬퍼 컴포넌트 ---

function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center h-screen">
      <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
}

function Alert({ message, type, onClose }) {
  const bgColor = type === 'success' ? 'bg-green-500' : (type === 'warning' ? 'bg-yellow-500' : 'bg-red-500');
  return (
    <div className={`fixed top-5 right-5 ${bgColor} text-white p-4 rounded-lg shadow-lg z-50`}>
      <span>{String(message)}</span>
      <button onClick={onClose} className="ml-4 font-bold">X</button>
    </div>
  );
}

function TabButton({ children, onClick, isActive }) {
  return (
    <button
      onClick={onClick}
      className={`py-3 px-6 font-semibold rounded-t-lg focus:outline-none transition-colors duration-200
        ${isActive
          ? 'bg-white text-blue-600 border-b-2 border-blue-600'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }
      `}
    >
      {children}
    </button>
  );
}

function Icon({ path, size = 6 }) {
  return (
    <svg className={`w-${size} h-${size}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

// 디버그 정보 컴포넌트
function DebugInfo({ userId, appId, permissionError }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!permissionError && !isOpen) return null;

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 bg-red-800 text-white text-xs px-3 py-2 rounded shadow-lg opacity-80 hover:opacity-100 no-print animate-bounce z-50"
      >
        ⚠️ 연결 상태 확인
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 bg-white border border-red-300 p-4 rounded shadow-xl text-xs z-50 max-w-md no-print">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-bold text-red-600">연결 정보</h4>
        <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-black">닫기</button>
      </div>
      <div className="space-y-1 text-gray-700">
        <p><strong>로그인 상태:</strong> {userId ? '✅ 로그인 됨' : '❌ 로그인 안됨'}</p>
        <p><strong>App ID:</strong> {appId}</p>
        <p><strong>저장소:</strong> 개인용 (Private)</p>
        <p className="text-red-600 font-bold">{permissionError ? '권한 오류 발생' : ''}</p>
      </div>
    </div>
  );
}

// 1. 보고서 제출 폼
function SubmissionForm({ db, userId, appId, setAlert }) {
  const getInitialFormState = () => {
    const categoriesState = {};
    CATEGORIES.forEach(cat => {
      categoriesState[cat.id] = {};
      cat.subCategories.forEach(subCat => {
        categoriesState[cat.id][subCat.id] = { plan: '', performance: '', status: '' };
      });
    });
    return {
      reportingWeek: '',
      siteName: SITES[0],
      proofLink: '',
      categories: categoriesState
    };
  };

  const [formData, setFormData] = useState(getInitialFormState());
  const [isLoading, setIsLoading] = useState(false);
  const [todayDate, setTodayDate] = useState(''); 

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (catId, subCatId, field, value) => {
    setFormData(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [catId]: {
          ...prev.categories[catId],
          [subCatId]: {
            ...prev.categories[catId][subCatId],
            [field]: value
          }
        }
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!db) {
      setAlert({ type: 'error', message: '데이터베이스에 연결되지 않았습니다.' });
      return;
    }
    if (!userId) {
      setAlert({ type: 'error', message: '로그인 정보가 없습니다.' });
      return;
    }
    if (!formData.reportingWeek) {
      setAlert({ type: 'error', message: '보고 주차를 입력하세요.' });
      return;
    }

    setIsLoading(true);
    try {
      // [경로 수정] 사용자 전용 경로 사용 (권한 오류 해결)
      // Path: artifacts/{appId}/users/{userId}/weeklyReports
      const colRef = collection(db, 'artifacts', appId, 'users', userId, 'weeklyReports');

      const docData = {
        ...formData,
        userId: userId,
        createdAt: new Date().toISOString(),
      };

      await addDoc(colRef, docData);

      setAlert({ type: 'success', message: '보고서가 안전하게 저장되었습니다.' });
      setFormData(getInitialFormState());
      setDefaultWeekAndDate();

    } catch (error) {
      console.error("제출 오류:", error);
      if (error.code === 'permission-denied') {
        setAlert({ type: 'error', message: '저장 실패: 쓰기 권한이 없습니다.' });
      } else {
        setAlert({ type: 'error', message: `저장 실패: ${error.message}` });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getISOWeek = (date) => {
    const dt = new Date(date.valueOf());
    const dayn = (date.getDay() + 6) % 7;
    dt.setDate(dt.getDate() - dayn + 3);
    const firstThursday = dt.valueOf();
    dt.setMonth(0, 1);
    if (dt.getDay() !== 4) {
      dt.setMonth(0, 1 + ((4 - dt.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - dt) / 604800000);
  };

  const setDefaultWeekAndDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const week = getISOWeek(today);
    const defaultWeek = `${year}-W${String(week).padStart(2, '0')}`;
    setFormData(prev => ({ ...prev, reportingWeek: defaultWeek }));
    setTodayDate(today.toLocaleDateString('ko-KR'));
  };

  useEffect(() => {
    setDefaultWeekAndDate();
  }, []);


  return (
    <form onSubmit={handleSubmit} className="space-y-8 p-4 md:p-8 bg-white shadow-xl rounded-2xl border border-gray-100">
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label htmlFor="reportingWeek" className="block text-sm font-medium text-gray-700">
            보고 주차 (예: 2025-W30)
          </label>
          <input
            type="week"
            id="reportingWeek"
            name="reportingWeek"
            value={formData.reportingWeek}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="siteName" className="block text-sm font-medium text-gray-700">현장 이름</label>
          <select
            id="siteName"
            name="siteName"
            value={formData.siteName}
            onChange={handleInputChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {SITES.map(site => (
              <option key={site} value={site}>{site}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="submissionDate" className="block text-sm font-medium text-gray-700">제출일자</label>
          <input
            type="text"
            id="submissionDate"
            name="submissionDate"
            value={todayDate}
            readOnly
            disabled
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-gray-100 text-gray-700"
          />
        </div>
      </div>

      <div className="space-y-6">
        {CATEGORIES.map(cat => (
          <div key={cat.id} className="border border-gray-200 p-4 rounded-lg">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{cat.name}</h3>
            <div className="space-y-4">
              {cat.subCategories.map(subCat => (
                <div key={subCat.id} className="border border-gray-100 p-3 rounded-md">
                  <h4 className="text-md font-semibold text-gray-700 mb-3">{subCat.name}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <textarea
                      placeholder="금주 계획"
                      rows="3"
                      value={formData.categories[cat.id]?.[subCat.id]?.plan || ''}
                      onChange={(e) => handleCategoryChange(cat.id, subCat.id, 'plan', e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <textarea
                      placeholder="금주 실적"
                      rows="3"
                      value={formData.categories[cat.id]?.[subCat.id]?.performance || ''}
                      onChange={(e) => handleCategoryChange(cat.id, subCat.id, 'performance', e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <textarea
                      placeholder="이행 현황 (또는 차주 계획)"
                      rows="3"
                      value={formData.categories[cat.id]?.[subCat.id]?.status || ''}
                      onChange={(e) => handleCategoryChange(cat.id, subCat.id, 'status', e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <label htmlFor="proofLink" className="block text-sm font-medium text-gray-700">
          증빙 자료 링크 (구글 드라이브 등)
        </label>
        <input
          type="url"
          id="proofLink"
          name="proofLink"
          value={formData.proofLink}
          onChange={handleInputChange}
          placeholder="https://docs.google.com/..."
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <div className="text-right">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex justify-center py-3 px-8 border border-transparent shadow-lg text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
        >
          {isLoading ? '제출 중...' : '주간 보고서 제출'}
        </button>
      </div>
    </form>
  );
}

// 2. 관리자 대시보드 (개인용으로 변경됨)
function AdminDashboard({ submissions, isLoading, deleteReport }) {
  const [selectedWeek, setSelectedWeek] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(null);

  const availableWeeks = useMemo(() => {
    const weeks = new Set(submissions.map(s => s.reportingWeek));
    return Array.from(weeks).sort().reverse();
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    if (!selectedWeek) {
      return submissions;
    }
    return submissions.filter(s => s.reportingWeek === selectedWeek);
  }, [submissions, selectedWeek]);

  useEffect(() => {
    if (availableWeeks.length > 0) {
      setSelectedWeek(availableWeeks[0]);
    }
  }, [availableWeeks]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-white shadow-xl rounded-2xl border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">내 보고서 관리</h2>
      <p className="text-sm text-gray-500 mb-6">내가 제출한 보고서만 조회 및 관리할 수 있습니다.</p>

      <div className="flex flex-wrap justify-between items-center mb-4 gap-4 no-print">
        <div className="flex items-center space-x-2">
          <label htmlFor="weekFilter" className="text-sm font-medium text-gray-700">주차 선택:</label>
          <select
            id="weekFilter"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">-- 전체 주차 --</option>
            {availableWeeks.map(week => (
              <option key={week} value={week}>{week}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <Icon path="M17 17h-1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1zm0-10h-1a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z M7 17H6a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1zm0-10H6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z" size={5} />
          <span className="ml-2">현재 뷰 인쇄</span>
        </button>
      </div>

      <div className="mb-6 no-print">
        <p className="text-sm text-gray-600">
          {selectedWeek ? `${selectedWeek} 주차` : '전체 기간'} 동안
          총 <span className="font-bold text-blue-600">{filteredSubmissions.length}개</span>의 보고서가 있습니다.
        </p>
      </div>

      <div className="overflow-x-auto print-container">
        <div id="report-table" className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 border">
            <thead className="bg-gray-100">
              <tr>
                <th scope="col" rowSpan="3" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border align-middle">현장명</th>
                {CATEGORIES.map(cat => (
                  <th key={cat.id} colSpan={cat.subCategories.length * 3} className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border">{cat.name}</th>
                ))}
                <th scope="col" rowSpan="3" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border align-middle">증빙 링크</th>
                <th scope="col" rowSpan="3" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border no-print align-middle">제출일시</th>
                <th scope="col" rowSpan="3" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border no-print align-middle">관리</th>
              </tr>
              <tr className="bg-gray-50">
                {CATEGORIES.map(cat => (
                  <React.Fragment key={cat.id}>
                    {cat.subCategories.map(subCat => (
                      <th key={subCat.id} colSpan="3" className="px-2 py-3 text-center text-xs font-medium text-gray-500 border">{subCat.name}</th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
              <tr className="bg-gray-50">
                {CATEGORIES.map(cat => (
                  <React.Fragment key={cat.id}>
                    {cat.subCategories.map(subCat => (
                      <React.Fragment key={subCat.id}>
                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 border">계획</th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 border">실적</th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 border">현황</th>
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSubmissions.sort((a, b) => a.siteName.localeCompare(b.siteName)).map((sub) => (
                <tr key={sub.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border">{sub.siteName}</td>
                  {CATEGORIES.map(cat => (
                    <React.Fragment key={cat.id}>
                      {cat.subCategories.map(subCat => (
                        <React.Fragment key={subCat.id}>
                          <td className="px-2 py-4 text-sm text-gray-600 border min-w-[100px] whitespace-pre-wrap">{sub.categories[cat.id]?.[subCat.id]?.plan}</td>
                          <td className="px-2 py-4 text-sm text-gray-600 border min-w-[100px] whitespace-pre-wrap">{sub.categories[cat.id]?.[subCat.id]?.performance}</td>
                          <td className="px-2 py-4 text-sm text-gray-600 border min-w-[100px] whitespace-pre-wrap">{sub.categories[cat.id]?.[subCat.id]?.status}</td>
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 border">
                    {sub.proofLink && (
                      <a href={sub.proofLink} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        링크 열기
                      </a>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 border no-print">
                    {sub.createdAt ? new Date(sub.createdAt).toLocaleString('ko-KR') : '날짜 없음'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium border no-print">
                    <button
                      onClick={() => {
                        setShowConfirmModal(sub.id);
                      }}
                      className="text-red-600 hover:text-red-900"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 no-print">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">삭제 확인</h3>
            <p className="text-gray-700 mb-6">
              이 보고서를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowConfirmModal(null)}
                className="py-2 px-4 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 focus:outline-none"
              >
                취소
              </button>
              <button
                onClick={() => {
                  deleteReport(showConfirmModal);
                  setShowConfirmModal(null);
                }}
                className="py-2 px-4 rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-container, .print-container * {
            visibility: visible;
          }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          table {
            font-size: 8px !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #ccc !important;
            padding: 4px !important;
            word-break: break-all;
            white-space: pre-wrap !important;
          }
          thead {
            display: table-header-group !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
          @page {
            size: A4 landscape;
            margin: 1cm;
          }
        }
      `}</style>

    </div>
  );
}

// --- 메인 App 컴포넌트 ---
export default function App() {
  const [activeTab, setActiveTab] = useState('form'); 
  const [submissions, setSubmissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  
  const [permissionError, setPermissionError] = useState(false);
  const [rateLimitError, setRateLimitError] = useState(false);

  const [currentDb, setCurrentDb] = useState(null);
  const [currentAuth, setCurrentAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (!auth || !db) {
      if (!firebaseConfig || !firebaseConfig.apiKey || (firebaseConfig.apiKey.startsWith("YOUR_") && typeof __firebase_config === 'undefined')) {
        console.error("Firebase 설정이 없습니다.");
        setAlert({ type: 'error', message: 'Firebase 설정(API KEY)이 유효하지 않습니다.' });
      } else {
        console.error("Firebase SDK 초기화 실패");
        setAlert({ type: 'error', message: 'Firebase 초기화 오류' });
      }
      setIsLoading(false);
      return;
    }

    setCurrentDb(db);
    setCurrentAuth(auth);

    const initAuth = async () => {
      // 기존 세션이 있으면 그대로 사용 (불필요한 재로그인 방지)
      if (auth.currentUser) {
          console.log("기존 세션 유지:", auth.currentUser.uid);
          setUserId(auth.currentUser.uid);
          setIsAuthReady(true);
          return;
      }

      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
          console.log("커스텀 토큰 로그인 성공");
        } else {
          await signInAnonymously(auth);
          console.log("익명 로그인 성공");
        }
      } catch (error) {
        console.error("로그인 실패:", error);
        if (error.code === 'auth/too-many-requests') {
             setRateLimitError(true);
        }
        // 로그인 실패해도 UI 렌더링을 위해 ready 상태로 변경
        setIsAuthReady(true);
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("인증됨:", user.uid);
        setUserId(user.uid);
        setRateLimitError(false); 
      } else {
        console.log("로그아웃됨");
        setUserId(null);
      }
      setIsAuthReady(true); 
    });

    return () => unsubscribe();
  }, []); 

  useEffect(() => {
    if (permissionError || rateLimitError) return;

    if (!currentDb || !isAuthReady || !userId) {
      if (isLoading && isAuthReady && !userId) {
         setIsLoading(false);
      }
      return;
    }

    // [경로 수정] 사용자 개인 공간 사용 (권한 오류 회피)
    // Path: artifacts/{appId}/users/{userId}/weeklyReports
    const dbPath = `artifacts/${appId}/users/${userId}/weeklyReports`;
    console.log("Firestore 구독:", dbPath);
    
    setIsLoading(true);
    const q = query(collection(currentDb, 'artifacts', appId, 'users', userId, 'weeklyReports'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const reports = [];
      querySnapshot.forEach((doc) => {
        reports.push({ id: doc.id, ...doc.data() });
      });
      reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setSubmissions(reports);
      setIsLoading(false);
      setPermissionError(false);
    }, (error) => {
      console.error("데이터 수신 오류:", error);
      
      if (error.code === 'permission-denied') {
         setPermissionError(true);
      } else {
         setAlert({ type: 'error', message: `데이터 로딩 실패: ${error.message}` });
      }
      setIsLoading(false);
    });

    return () => unsubscribe();

  }, [currentDb, isAuthReady, userId, permissionError, rateLimitError]); 

  const handleRetry = async () => {
      setPermissionError(false);
      setRateLimitError(false);
      setIsLoading(true);
      
      try {
          await signOut(auth);
          await signInAnonymously(auth);
      } catch (e) {
          console.error("재시도 로그인 실패", e);
          if (e.code === 'auth/too-many-requests') {
              setRateLimitError(true);
          } else {
              setAlert({ type: 'error', message: "재로그인 실패: " + e.message });
          }
          setIsLoading(false);
      }
  };

  const deleteReport = async (id) => {
    if (!currentDb || !userId) {
      setAlert({ type: 'error', message: '연결 안 됨' });
      return;
    }

    try {
      // [경로 수정] 삭제 시에도 동일한 개인 경로 사용
      const colRef = collection(currentDb, 'artifacts', appId, 'users', userId, 'weeklyReports');
      await deleteDoc(doc(colRef, id));
      setAlert({ type: 'success', message: '보고서가 삭제되었습니다.' });
    } catch (error) {
      console.error("삭제 오류:", error);
      setAlert({ type: 'error', message: `삭제 실패: ${error.message}` });
    }
  };

  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => {
        setAlert(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  const renderContent = () => {
    if (rateLimitError) {
        return (
            <div className="text-center p-10 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="text-yellow-600 mb-4">
                    <Icon path="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={12} />
                </div>
                <h2 className="text-xl font-bold text-yellow-800">로그인 요청 과다</h2>
                <p className="text-yellow-700 mt-2 mb-6">잠시 후 다시 시도해주세요.</p>
                <button onClick={handleRetry} className="px-6 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors">재시도</button>
            </div>
        );
    }

    if (permissionError) {
        return (
            <div className="text-center p-10 bg-red-50 border border-red-200 rounded-lg">
                <h2 className="text-xl font-bold text-red-800">데이터 접근 권한 오류</h2>
                <p className="text-red-700 mt-2 mb-6">
                    개인 데이터 공간에 접근할 수 없습니다.<br/>아래 버튼으로 세션 복구를 시도하세요.
                </p>
                <button onClick={handleRetry} className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">세션 복구 및 재시도</button>
            </div>
        );
    }

    if (typeof __firebase_config === 'undefined' && firebaseConfig.apiKey.startsWith("YOUR_")) {
        return (
            <div className="text-center p-10 bg-red-100 border border-red-400 rounded-lg">
                <h2 className="text-xl font-bold text-red-800">설정값 입력 필요</h2>
                <p className="text-red-700 mt-2">코드 상단의 <code>firebaseConfig</code> 값을 설정해주세요.</p>
            </div>
        );
    }

    if (isLoading && !isAuthReady) {
        return <LoadingSpinner />;
    }

    return (
        <>
            <div className={activeTab === 'form' ? 'block' : 'hidden'}>
                <SubmissionForm db={currentDb} userId={userId} appId={appId} setAlert={setAlert} />
            </div>
            <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
                <AdminDashboard submissions={submissions} isLoading={isLoading} deleteReport={deleteReport} />
            </div>
        </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {alert && <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />}
      
      <DebugInfo 
        userId={userId} 
        appId={appId} 
        dbPath={`artifacts/${appId}/users/...`} 
        permissionError={permissionError} 
      />

      <header className="bg-white shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-5">
            <div className="flex items-center space-x-3">
              <span className="p-2 bg-blue-600 rounded-lg text-white">
                <Icon path="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" size={8} />
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">주간 안전보건 점검 시스템</h1>
            </div>
          </div>
          <nav className="flex space-x-1 no-print">
            <TabButton onClick={() => setActiveTab('form')} isActive={activeTab === 'form'}>보고서 제출</TabButton>
            <TabButton onClick={() => setActiveTab('dashboard')} isActive={activeTab === 'dashboard'}>내 보고서 관리</TabButton>
          </nav>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        {renderContent()}
      </main>

      <footer className="text-center text-gray-500 text-xs mt-8 no-print">
        <p>UserID: {userId || '연결 안 됨'} | AppID: {appId}</p>
        <p>© 2025 Construction Safety Management System | 안전보건팀</p>
      </footer>
    </div>
  );
}