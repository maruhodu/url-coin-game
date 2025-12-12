// [js/market.js]
import { db, doc, onSnapshot, setDoc, updateDoc, getDoc } from './firebase-config.js';

// [중요] export가 반드시 있어야 admin.js에서 가져갈 수 있습니다!
export const initialCoins = [
    { id: 'c1', name: '키위', price: 21000, change: 0, type: 'even', color: 'lime', icon: 'fa-kiwi-bird', desc: '#상큼 #비타민', volatility: 0.03, history: [] },
    { id: 'c2', name: '골드 키위', price: 12500, change: 0, type: 'even', color: 'yellow', icon: 'fa-kiwi-bird', desc: '#달콤 #프리미엄', volatility: 0.015, history: [] },
    { id: 'c3', name: '검은 고양이', price: 8400, change: 0, type: 'even', color: 'gray', icon: 'fa-cat', desc: '#시크 #도도', volatility: 0.04, history: [] },
    { id: 'c4', name: '초록 고양이', price: 45000, change: 0, type: 'even', color: 'emerald', icon: 'fa-cat', desc: '#이세계 #신비', volatility: 0.01, history: [] },
    { id: 'c5', name: '악마', price: 5200, change: 0, type: 'even', color: 'red', icon: 'fa-fire', desc: '#매운맛 #폭주', volatility: 0.02, history: [] },
    { id: 'c6', name: '따봉', price: 3200, change: 0, type: 'even', color: 'blue', icon: 'fa-thumbs-up', desc: '#최고 #좋아요', volatility: 0.025, history: [] },
    { id: 'c7', name: '도토리', price: 15600, change: 0, type: 'even', color: 'orange', icon: 'fa-leaf', desc: '#가을 #다람쥐', volatility: 0.02, history: [] },
    { id: 'c8', name: '황금 도토리', price: 980, change: 0, type: 'even', color: 'amber', icon: 'fa-star', desc: '#레어 #전설', volatility: 0.08, history: [] },
    { id: 'c9', name: '북극 여우', price: 7500, change: 0, type: 'even', color: 'cyan', icon: 'fa-snowflake', desc: '#추위 #하양', volatility: 0.015, history: [] },
    { id: 'c10', name: '여우', price: 2200, change: 0, type: 'even', color: 'orange', icon: 'fa-paw', desc: '#영리함 #날쌘돌이', volatility: 0.03, history: [] }
];

let currentCoins = [];
let lastSlotId = ""; 

// 1. 마켓 데이터 리스너
export function initMarketListener(onUpdate) {
    const marketRef = doc(db, "system", "market");
    onSnapshot(marketRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentCoins = data.items;
            lastSlotId = data.lastSlotId || ""; 
            onUpdate(currentCoins);
        } else {
            console.log("마켓 데이터 초기화 중...");
            initialCoins.forEach(c => { c.history = new Array(30).fill(c.price); });
            await setDoc(marketRef, { 
                items: initialCoins,
                lastSlotId: "" 
            });
        }
    });
}

// 2. Getter
export function getCoins() { return currentCoins.length > 0 ? currentCoins : initialCoins; }
export function getCoinById(id) { return currentCoins.find(c => c.id === id) || initialCoins.find(c => c.id === id); }

// 3. 15분 단위 업데이트 체크
export async function tryUpdateMarket() {
    if (currentCoins.length === 0) return;

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kstGap = 9 * 60 * 60 * 1000; 
    const kstDate = new Date(utc + kstGap);

    const minutes = kstDate.getMinutes();
    const slotMinutes = Math.floor(minutes / 15) * 15;
    const slotId = `${kstDate.getFullYear()}${kstDate.getMonth()+1}${kstDate.getDate()}-${kstDate.getHours()}${String(slotMinutes).padStart(2, '0')}`;

    if (lastSlotId === slotId) return; 

    console.log(`🕒 시세 갱신 타임! (${slotId})`);

    const updatedCoins = currentCoins.map(coin => {
        let newPrice = coin.price;
        if (coin.forcedChange !== undefined && coin.forcedChange !== null) {
            newPrice = Math.floor(coin.price * (1 + coin.forcedChange / 100));
            delete coin.forcedChange;
        } else {
            const percentChange = (Math.random() * 2 - 1) * coin.volatility;
            newPrice = Math.floor(coin.price * (1 + percentChange));
        }
        if(newPrice < 10) newPrice = 10;

        const changeRate = ((newPrice - coin.price) / coin.price) * 100;
        let type = 'even';
        if(changeRate > 0) type = 'up';
        else if(changeRate < 0) type = 'down';

        const newHistory = [...coin.history, newPrice];
        if(newHistory.length > 30) newHistory.shift();

        const { forcedChange, ...cleanCoin } = coin;

        return {
            ...cleanCoin,
            price: newPrice,
            change: changeRate.toFixed(2),
            type: type,
            history: newHistory
        };
    });

    try {
        await updateDoc(doc(db, "system", "market"), { 
            items: updatedCoins,
            lastSlotId: slotId 
        });
        console.log("✅ DB 업데이트 완료");
    } catch(e) { }
}

// 4. 관리자용 강제 업데이트 (Admin.js에서 사용)
export async function forceMarketUpdate() {
    if (currentCoins.length === 0) return;
    console.log("⚡ 강제 시세 갱신 실행");

    const updatedCoins = currentCoins.map(coin => {
        let newPrice = coin.price;
        if (coin.forcedChange !== undefined && coin.forcedChange !== null) {
            newPrice = Math.floor(coin.price * (1 + coin.forcedChange / 100));
            delete coin.forcedChange;
        } else {
            const percentChange = (Math.random() * 2 - 1) * coin.volatility;
            newPrice = Math.floor(coin.price * (1 + percentChange));
        }
        if(newPrice < 10) newPrice = 10;

        const changeRate = ((newPrice - coin.price) / coin.price) * 100;
        let type = 'even';
        if(changeRate > 0) type = 'up';
        else if(changeRate < 0) type = 'down';

        const newHistory = [...coin.history, newPrice];
        if(newHistory.length > 30) newHistory.shift();

        const { forcedChange, ...cleanCoin } = coin;

        return {
            ...cleanCoin,
            price: newPrice,
            change: changeRate.toFixed(2),
            type: type,
            history: newHistory
        };
    });

    try {
        await updateDoc(doc(db, "system", "market"), { items: updatedCoins });
        return true;
    } catch(e) { 
        console.error(e);
        return false;
    }
}