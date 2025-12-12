// [js/auth.js]
import { 
    auth, db, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, doc, getDoc, setDoc, onSnapshot, updateDoc,
    query, collection, where, getDocs
} from './firebase-config.js';
import { getCoins } from './market.js';

let currentUserData = null;
let unsubscribeUser = null;
const FAKE_DOMAIN = "@urlcoin.game";

// 2. [수정됨] 회원가입 함수 (닉네임 중복 체크 추가)
export async function registerWithID(id, pw, nickname) {
    const email = id + "@urlcoin.game"; // 가짜 도메인

    try {
        // [추가된 부분] 닉네임 중복 검사 -----------------------
        const usersRef = collection(db, "users");
        // "users" 컬렉션에서 "nickname"이 입력받은 nickname과 "=="(같은) 문서를 찾음
        const q = query(usersRef, where("nickname", "==", nickname));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // 결과가 비어있지 않다 = 이미 누군가 쓰고 있다
            return { success: false, message: "이미 사용 중인 닉네임입니다." };
        }
        // ---------------------------------------------------

        // 중복이 없으면 회원가입 진행 (기존 로직)
        const userCredential = await createUserWithEmailAndPassword(auth, email, pw);
        const user = userCredential.user;
        
        await createInitialUser(user, nickname);
        return { success: true };

    } catch (error) {
        console.error("회원가입 에러:", error.code);
        let msg = "회원가입 실패";
        if (error.code === 'auth/email-already-in-use') msg = "이미 존재하는 아이디입니다.";
        if (error.code === 'auth/weak-password') msg = "비밀번호는 6자리 이상이어야 합니다.";
        return { success: false, message: msg };
    }
}

// 2. 로그인 (ID/PW)
export async function loginWithID(id, pw) {
    const email = id + FAKE_DOMAIN;
    try {
        await signInWithEmailAndPassword(auth, email, pw);
        return { success: true };
    } catch (error) {
        console.error("로그인 에러:", error.code);
        let msg = "로그인 실패";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
            msg = "아이디 또는 비밀번호가 틀렸습니다.";
        }
        return { success: false, message: msg };
    }
}

// 3. 로그아웃
export async function handleLogout() {
    try {
        await signOut(auth);
        if(unsubscribeUser) unsubscribeUser();
        currentUserData = null;
        location.reload();
    } catch (error) { console.error(error); }
}

// 4. 데이터 초기 생성 (내부용)
async function createInitialUser(user, nickname) {
    const userRef = doc(db, "users", user.uid);
    const now = new Date();
    
    const initialData = {
        uid: user.uid,
        nickname: nickname,
        email: user.email,
        cash: 500000,
        holdings: {},
        history: [],
        totalAsset: 500000,
        hourlyAsset: 500000,
        lastHourChecked: now.getHours(),
        todayProfit: 0,
        yesterdayProfit: 0,
        lastLoginDate: now.toDateString(),
        createdAt: new Date().toISOString()
    };
    await setDoc(userRef, initialData);
}

// 5. 날짜/시간 체크 (앱 실행 시 호출)
export async function checkUserDate(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if(!userSnap.exists()) return;

    const data = userSnap.data();
    
    // 날짜 비교를 위해 시/분/초를 뗀 순수 날짜 객체 생성
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const lastLoginStr = data.lastLoginDate || ""; // 예: "Fri Dec 12 2025"
    const lastDate = new Date(lastLoginStr);
    const lastLoginDateObj = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());

    const diffTime = todayDate - lastLoginDateObj;
    const diffDays = diffTime / (1000 * 60 * 60 * 24); // 날짜 차이 계산

    let updates = {};

    // 1. 날짜 변경 체크 (00시 기준 초기화)
    if (diffDays > 0) {
        if (diffDays === 1) {
            // 어제 접속하고 오늘 들어옴 -> 어제 번 돈을 '전일 수익'으로 확정
            updates.yesterdayProfit = data.todayProfit || 0;
        } else {
            // 2일 이상 미접속 -> 어제 기록 없음
            updates.yesterdayProfit = 0;
        }
        
        // 오늘 수익 리셋, 날짜 갱신
        updates.todayProfit = 0;
        updates.lastLoginDate = now.toDateString();
    }

    // 2. 시간 변경 체크 (정각 자산 스냅샷)
    const currentHour = now.getHours();
    if (data.lastHourChecked !== currentHour) {
        let currentTotalAsset = data.cash;
        const coins = getCoins();
        if(data.holdings) {
            Object.keys(data.holdings).forEach(coinId => {
                const coin = coins.find(c => c.id === coinId);
                if(coin) currentTotalAsset += (data.holdings[coinId].qty * coin.price);
            });
        }
        updates.lastHourChecked = currentHour;
        updates.hourlyAsset = currentTotalAsset; // 랭킹용 스냅샷
        updates.totalAsset = currentTotalAsset;  // 참고용
    }

    if (Object.keys(updates).length > 0) {
        await updateDoc(userRef, updates);
    }
}

// 6. 실시간 데이터 감시
export function listenToUserData(uid, onUpdate) {
    const userRef = doc(db, "users", uid);
    unsubscribeUser = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
            currentUserData = doc.data();
            onUpdate(currentUserData);
        }
    });
}

export function getCurrentUserData() { return currentUserData; }