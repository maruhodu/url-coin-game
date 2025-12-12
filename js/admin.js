// [js/admin.js]
import { db, doc, updateDoc, collection, query, where, getDocs, setDoc } from './firebase-config.js';
// [중요] initialCoins와 forceMarketUpdate 가져오기
import { getCoins, initialCoins, forceMarketUpdate } from './market.js'; 

export function initAdminPage() {
    const coinSelect = document.getElementById('admin-coin-select');
    const coins = getCoins();

    if(coinSelect) {
        coinSelect.innerHTML = '<option value="">선택 안함 (공지만 변경)</option>';
        coins.forEach(c => {
            coinSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
    }

    // 1. 이벤트 발동 (기존 코드 유지)
    document.getElementById('btn-admin-event').addEventListener('click', async () => {
        const newsText = document.getElementById('admin-news-text').value;
        const targetId = document.getElementById('admin-coin-select').value;
        const percent = parseFloat(document.getElementById('admin-coin-percent').value);

        if(!newsText && !targetId) { alert("설정 확인 필요"); return; }

        try {
            if(newsText) await setDoc(doc(db, "system", "news"), { text: newsText });
            
            if(targetId && !isNaN(percent)) {
                const marketRef = doc(db, "system", "market");
                const currentCoins = getCoins();
                const updatedCoins = currentCoins.map(c => {
                    if(c.id === targetId) return { ...c, forcedChange: percent };
                    return c;
                });
                await updateDoc(marketRef, { items: updatedCoins });
            }
            alert("적용되었습니다 (다음 갱신 때 가격 반영됨)");
        } catch(e) { console.error(e); }
    });

    // 2. 지원금 지급 (기존 코드 유지)
    document.getElementById('btn-admin-give').addEventListener('click', async () => {
        const nick = document.getElementById('admin-user-nick').value.trim();
        const amount = parseInt(document.getElementById('admin-user-amount').value);
        if(!nick || isNaN(amount)) return;

        try {
            const q = query(collection(db, "users"), where("nickname", "==", nick));
            const querySnapshot = await getDocs(q);
            if(querySnapshot.empty) { alert("유저 없음"); return; }
            const targetUser = querySnapshot.docs[0];
            await updateDoc(targetUser.ref, { cash: (targetUser.data().cash || 0) + amount });
            alert("지급 완료");
        } catch(e) { console.error(e); }
    });

    // ============================================================
    // [수정됨] 3. 시장 초기화 버튼 (Initial Reset)
    // ============================================================
    const btnReset = document.getElementById('btn-admin-reset');
    if(btnReset) {
        btnReset.addEventListener('click', async () => {
            if(!confirm("⚠️ 경고: 모든 코인 가격이 초기값(상장가)으로 돌아갑니다.\n계속하시겠습니까?")) return;
            
            try {
                // [핵심] 그냥 initialCoins를 넣지 않고, 데이터를 깨끗하게 재가공합니다.
                const cleanCoins = initialCoins.map(c => ({
                    ...c,
                    // 가격은 원본(initialCoins)에 적힌 가격(예: 21000) 그대로 사용
                    change: 0,
                    type: 'even',
                    // 차트 기록을 해당 가격으로 30개 채움 (일직선 차트)
                    history: new Array(30).fill(c.price)
                }));

                // DB 덮어쓰기 (lastSlotId 초기화)
                await setDoc(doc(db, "system", "market"), { 
                    items: cleanCoins,
                    lastSlotId: "" 
                });
                
                alert("✅ 시장 가격이 초기화되었습니다.");
            } catch(e) {
                console.error(e);
                alert("초기화 실패: " + e.message);
            }
        });
    }

    // ============================================================
    // [추가됨] 4. 가격 강제 갱신 버튼 (Force Update)
    // ============================================================
    const btnForce = document.getElementById('btn-force-update');
    if(btnForce) {
        btnForce.addEventListener('click', async () => {
            if(!confirm("즉시 다음 턴을 진행하시겠습니까?")) return;
            
            const result = await forceMarketUpdate();
            if(result) alert("✅ 가격이 갱신되었습니다.");
            else alert("❌ 갱신 실패 (로그 확인)");
        });
    }

    // [js/admin.js] 하단부 (기존 랭킹 버튼 로직 삭제하고 아래 내용 추가)

    // ============================================================
    // [수정됨] 1. 총 자산 랭킹 갱신 (현재 시세 반영)
    // ============================================================
    const btnRankAsset = document.getElementById('btn-rank-update-asset');
    if(btnRankAsset) {
        btnRankAsset.addEventListener('click', async () => {
            if(!confirm("현재 코인 시세로 모든 유저의 '총 자산'을 재계산합니다.\n진행하시겠습니까?")) return;

            const originalText = btnRankAsset.innerText;
            btnRankAsset.innerText = "계산중...";
            
            try {
                const coins = getCoins(); // 현재 시세
                const querySnapshot = await getDocs(collection(db, "users"));
                let count = 0;

                const promises = querySnapshot.docs.map(async (userDoc) => {
                    const data = userDoc.data();
                    let currentTotalAsset = data.cash || 0; // 현금

                    // 보유 코인 가치 합산
                    if(data.holdings) {
                        Object.keys(data.holdings).forEach(coinId => {
                            const coin = coins.find(c => c.id === coinId);
                            if(coin) {
                                currentTotalAsset += (data.holdings[coinId].qty * coin.price);
                            }
                        });
                    }

                    // DB 업데이트 (totalAsset, hourlyAsset 갱신)
                    await updateDoc(userDoc.ref, {
                        totalAsset: currentTotalAsset,
                        hourlyAsset: currentTotalAsset 
                    });
                    count++;
                });

                await Promise.all(promises);
                alert(`✅ 총 ${count}명의 자산 랭킹이 갱신되었습니다.`);
                location.reload(); // 새로고침

            } catch(e) {
                console.error(e);
                alert("자산 갱신 실패: " + e.message);
                btnRankAsset.innerText = originalText;
            }
        });
    }

    // ============================================================
    // [수정됨] 2. 전일 수익 랭킹 갱신 (데이터 보정)
    // ============================================================
    const btnRankProfit = document.getElementById('btn-rank-update-profit');
    if(btnRankProfit) {
        btnRankProfit.addEventListener('click', async () => {
            if(!confirm("전일 수익 데이터가 없는 유저를 0원으로 초기화하여 랭킹에 표시되게 합니다.\n진행하시겠습니까?")) return;

            const originalText = btnRankProfit.innerText;
            btnRankProfit.innerText = "보정중...";

            try {
                const querySnapshot = await getDocs(collection(db, "users"));
                let count = 0;

                const promises = querySnapshot.docs.map(async (userDoc) => {
                    const data = userDoc.data();
                    // yesterdayProfit 필드가 아예 없거나 undefined인 경우만 0으로 설정
                    if (data.yesterdayProfit === undefined || data.yesterdayProfit === null) {
                        await updateDoc(userDoc.ref, {
                            yesterdayProfit: 0
                        });
                        count++;
                    }
                });

                await Promise.all(promises);
                
                if(count > 0) alert(`✅ ${count}명의 수익 데이터를 보정했습니다.`);
                else alert("✅ 모든 데이터가 이미 정상입니다.");
                
                location.reload(); // 새로고침

            } catch(e) {
                console.error(e);
                alert("수익 갱신 실패: " + e.message);
                btnRankProfit.innerText = originalText;
            }
        });
    }
}