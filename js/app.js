// [js/app.js]
import { initMarketListener, getCoins, tryUpdateMarket } from './market.js'; // tryUpdateMarket 가져오기
import { renderCoinList, updateCoinListUI, initNavigation, updateMyPageUI, updateMainHeader } from './ui.js';
import { auth, onAuthStateChanged, doc, db, onSnapshot } from './firebase-config.js';
import { listenToUserData, checkUserDate } from './auth.js';
import { initAdminPage } from './admin.js';

function initApp() {
    console.log("UR:L COIN Market Open...");
    
    initNavigation();
    initAdminPage();

    // 마켓 리스너
    initMarketListener((coins) => {
        if (document.getElementById('coin-list-container').innerHTML === '') {
            renderCoinList(coins);
        } else {
            updateCoinListUI(coins);
        }
    });

    // 뉴스 리스너
    onSnapshot(doc(db, "system", "news"), (doc) => {
        if (doc.exists()) {
            const newsText = doc.data().text;
            const ticker = document.querySelector('.animate-marquee');
            if(ticker) ticker.innerText = `📢 ${newsText}`;
        }
    });

    // 로그인 감지
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("User logged in:", user.uid);
            await checkUserDate(user);
            listenToUserData(user.uid, (userData) => {
                updateMyPageUI(user);
                updateMainHeader(getCoins()); 
            });
        } else {
            console.log("User logged out");
            updateMyPageUI(null);
            updateMainHeader(getCoins());
        }
    });

    // ============================================================
    // [핵심 변경] 모든 유저가 시세 갱신을 시도함 (P2P 방식)
    // ============================================================
    
    // 1초마다 "혹시 시간 지났나?" 체크하고 업데이트 시도
    setInterval(() => {
        // 1. 시세 갱신 (15분마다 - 기존 유지)
        tryUpdateMarket();

        // [수정됨] 2. 랭킹 갱신 (매일 00시 정각)
        const now = new Date();
        // 0시 0분이고, 0초~10초 사이일 때만 시도
        if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() < 10) {
            tryUpdateRankings();
        }
    }, 1000);
}

document.addEventListener('DOMContentLoaded', initApp);