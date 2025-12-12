// [js/ui.js]
import { getCoinById, getCoins } from './market.js';
import { handleLogout, getCurrentUserData, loginWithID, registerWithID, handleWithdrawal } from './auth.js';
import { db, doc, updateDoc, auth, getDocs, collection } from './firebase-config.js';

const formatNum = (num) => new Intl.NumberFormat('ko-KR').format(num);

// [차트 변수]
let assetChart = null;

// ============================================================
// 1. 네비게이션 및 페이지 전환
// ============================================================
export function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item'); 
    const sections = document.querySelectorAll('.page-section');
    
    // 홈 화면 자산 카드 클릭 시 이동
    const homeAssetCard = document.querySelector('#page-home .glass.rounded-3xl');
    if(homeAssetCard) {
        homeAssetCard.style.cursor = 'pointer'; 
        homeAssetCard.addEventListener('click', () => {
            const assetNavBtn = document.querySelector('.nav-item[data-target="page-assets"]');
            if(assetNavBtn) assetNavBtn.click();
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');

            // 페이지 전환
            sections.forEach(sec => {
                if(sec.id === targetId) sec.classList.remove('hidden');
                else sec.classList.add('hidden');
            });

            // 네비게이션 스타일
            navItems.forEach(nav => {
                if(nav.getAttribute('data-target') === targetId) {
                    nav.classList.remove('text-gray-500');
                    nav.style.color = 'var(--color-brand-olive)';
                } else {
                    nav.classList.add('text-gray-500');
                    nav.style.color = '';
                }
            });

            // 페이지별 로직
            if(targetId === 'page-assets') renderAssetPage(); 
            else if(targetId === 'page-ranking') renderRankingPage('total');
        });
    });

    const rankTabs = document.querySelectorAll('#page-ranking button');
    if(rankTabs.length > 0) {
        rankTabs[0].addEventListener('click', () => {
            // [수정됨] 텍스트 변경
            rankTabs[0].innerHTML = '총 자산 랭킹 (00시 기준)';
            renderRankingPage('total');
        });
        rankTabs[1].addEventListener('click', () => {
            rankTabs[1].innerHTML = '전일 수익 랭킹';
            renderRankingPage('profit');
        });
        
        // [수정됨] 초기 텍스트 변경
        rankTabs[0].innerHTML = '총 자산 랭킹 (00시 기준)';
        rankTabs[1].innerHTML = '전일 수익 랭킹';
    }

    // 1. 출석체크 버튼 (하루 1번, 10만원)
    const btnCheckin = document.getElementById('btn-checkin');
    if(btnCheckin) {
        btnCheckin.addEventListener('click', async () => {
            const userData = getCurrentUserData();
            if(!userData) {
                showSystemModal('warn', '로그인 필요', '로그인 후 이용 가능합니다.', '확인');
                return;
            }

            const today = new Date().toDateString(); // "Fri Dec 13 2025" 형식 (시간 무시)

            // 이미 출석했는지 확인
            if(userData.lastAttendanceDate === today) {
                showSystemModal('warn', '이미 완료', '오늘의 출석 보상을 이미 받았습니다.<br>내일 다시 방문해주세요!', '확인');
                return;
            }

            // 보상 지급 로직
            try {
                const newCash = userData.cash + 100000;
                await updateDoc(doc(db, "users", auth.currentUser.uid), {
                    cash: newCash,
                    lastAttendanceDate: today
                });
                showSystemModal('success', '출석체크 완료', '100,000 원이 지급되었습니다!', '확인');
            } catch(e) {
                console.error(e);
            }
        });
    }

    // 2. 무료 충전소 버튼 (1만원 이하일 때, 하루 1번, 5만원)
    const btnBegging = document.getElementById('btn-begging');
    if(btnBegging) {
        btnBegging.addEventListener('click', async () => {
            const userData = getCurrentUserData();
            if(!userData) {
                showSystemModal('warn', '로그인 필요', '로그인 후 이용 가능합니다.', '확인');
                return;
            }

            // [수정됨] 현재 총 자산(현금 + 코인 평가금) 직접 계산
            // DB에 저장된 totalAsset은 갱신 주기가 있으므로, 정확한 판단을 위해 실시간 가격으로 계산합니다.
            const coins = getCoins();
            let currentTotalAsset = userData.cash;
            
            if(userData.holdings) {
                Object.keys(userData.holdings).forEach(coinId => {
                    const coin = coins.find(c => c.id === coinId);
                    if(coin) {
                        currentTotalAsset += (userData.holdings[coinId].qty * coin.price);
                    }
                });
            }

            // 조건 검사: 총 자산 10,000원 초과 시 거절
            if(currentTotalAsset > 10000) {
                showSystemModal('warn', '이용 불가', `총 자산(현금+코인)이 10,000원 이하일 때만<br>지원을 받을 수 있습니다.<br><span class="text-xs text-gray-400">(현재 자산: ${formatNum(currentTotalAsset)}원)</span>`, '확인');
                return;
            }

            const today = new Date().toDateString();

            // 오늘 이미 받았는지 확인
            if(userData.lastSupportDate === today) {
                showSystemModal('warn', '이미 완료', '무료 지원은 하루에 한 번만 가능합니다.', '확인');
                return;
            }

            // 지원금 지급
            try {
                const newCash = userData.cash + 50000;
                await updateDoc(doc(db, "users", auth.currentUser.uid), {
                    cash: newCash,
                    lastSupportDate: today
                });
                showSystemModal('success', '지원금 도착', '구조대가 도착했습니다!<br>50,000 원이 지급되었습니다.', '감사합니다');
            } catch(e) {
                console.error(e);
            }
        });
    }
}

// ============================================================
// 2. 마이페이지 & 로그인 UI
// ============================================================

// [로그인 모달]
function showLoginModal() {
    const modalContainer = document.getElementById('modal-container');
    const html = `
        <div class="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fade-in">
            <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" id="login-backdrop"></div>
            <div class="glass w-full max-w-sm bg-[#1a1b2e]/95 rounded-3xl p-8 relative z-10 animate-scale-up border border-white/10 shadow-2xl">
                <h3 class="text-2xl font-bold text-white mb-6 text-center">로그인</h3>
                <div class="space-y-4">
                    <div><label class="text-xs text-gray-400 ml-1">아이디</label><input type="text" id="login-id" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-olive transition" placeholder="영문, 숫자"></div>
                    <div><label class="text-xs text-gray-400 ml-1">비밀번호</label><input type="password" id="login-pw" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-olive transition" placeholder="6자리 이상"></div>
                    <div id="nickname-field" class="hidden"><label class="text-xs text-gray-400 ml-1">닉네임</label><input type="text" id="login-nick" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-olive transition" placeholder="게임에서 쓸 이름"></div>
                    <p id="login-msg" class="text-xs text-red-400 text-center min-h-[16px]"></p>
                    <button id="btn-submit-login" class="w-full py-3 rounded-xl bg-olive text-white font-bold shadow-lg active:scale-95 transition">로그인</button>
                    <div class="text-center text-xs text-gray-400 mt-4"><span id="mode-text">계정이 없으신가요?</span><button id="btn-toggle-mode" class="text-white font-bold ml-2 underline">회원가입</button></div>
                </div>
                <button id="btn-close-login" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
        </div>
    `;
    modalContainer.innerHTML = html;

    const els = {
        id: document.getElementById('login-id'),
        pw: document.getElementById('login-pw'),
        nick: document.getElementById('login-nick'),
        nickField: document.getElementById('nickname-field'),
        msg: document.getElementById('login-msg'),
        submit: document.getElementById('btn-submit-login'),
        toggle: document.getElementById('btn-toggle-mode'),
        modeText: document.getElementById('mode-text'),
        close: document.getElementById('btn-close-login'),
        backdrop: document.getElementById('login-backdrop')
    };

    let isRegisterMode = false;

    els.toggle.addEventListener('click', () => {
        isRegisterMode = !isRegisterMode;
        if(isRegisterMode) {
            els.nickField.classList.remove('hidden');
            els.submit.innerText = '회원가입';
            els.modeText.innerText = '이미 계정이 있으신가요?';
            els.toggle.innerText = '로그인';
        } else {
            els.nickField.classList.add('hidden');
            els.submit.innerText = '로그인';
            els.modeText.innerText = '계정이 없으신가요?';
            els.toggle.innerText = '회원가입';
        }
        els.msg.innerText = '';
    });

    els.submit.addEventListener('click', async () => {
        const id = els.id.value.trim();
        const pw = els.pw.value.trim();
        if(!id || !pw) { els.msg.innerText = '아이디와 비밀번호를 입력해주세요.'; return; }

        els.submit.innerText = '처리중...';
        els.submit.disabled = true;

        if(isRegisterMode) {
            const nick = els.nick.value.trim();
            if(!nick) { els.msg.innerText = '닉네임을 입력해주세요.'; els.submit.disabled = false; return; }
            const res = await registerWithID(id, pw, nick);
            if(res.success) { modalContainer.innerHTML = ''; } 
            else { els.msg.innerText = res.message; els.submit.disabled = false; els.submit.innerText = '회원가입'; }
        } else {
            const res = await loginWithID(id, pw);
            if(res.success) { modalContainer.innerHTML = ''; } 
            else { els.msg.innerText = res.message; els.submit.disabled = false; els.submit.innerText = '로그인'; }
        }
    });

    const close = () => modalContainer.innerHTML = '';
    els.close.addEventListener('click', close);
    els.backdrop.addEventListener('click', close);
}

// [마이페이지 업데이트]
export function updateMyPageUI(user) {
    const myPageSection = document.getElementById('page-mypage');
    if(!myPageSection) return;
    const profileArea = myPageSection.querySelector('.glass.rounded-3xl');

    if (user) {
        const userData = getCurrentUserData();
        const nickname = userData ? userData.nickname : (user.displayName || "로딩중...");
        const isAdmin = userData && userData.isAdmin === true; // 관리자 여부 확인

        // 관리자 버튼 HTML (조건부 렌더링)
        const adminBtnHtml = isAdmin ? 
            `<button id="btn-go-admin" class="mt-2 bg-red-500/20 text-red-400 border border-red-500/50 font-bold py-2 px-6 rounded-lg text-xs hover:bg-red-500/30 transition shadow-lg"><i class="fa-solid fa-user-secret mr-2"></i>관리자 페이지</button>` 
            : '';

        profileArea.innerHTML = `
            <div class="w-24 h-24 rounded-full bg-gray-700 mb-4 border-4 border-emerald-500/30 overflow-hidden flex items-center justify-center">
                 <i class="fa-solid fa-user-astronaut text-5xl text-emerald-200"></i>
            </div>
            <h2 class="text-2xl font-bold text-emerald-400">${nickname} 님</h2>
            
            <button id="btn-logout" class="bg-gray-600 text-white font-bold py-3 px-8 rounded-full text-sm hover:bg-gray-500 transition w-full max-w-[240px] shadow-lg mb-2">로그아웃</button>
            ${adminBtnHtml}
        `;
        
        document.getElementById('btn-logout').addEventListener('click', handleLogout);
        
        // 관리자 버튼 이벤트
        if(isAdmin) {
            document.getElementById('btn-go-admin').addEventListener('click', () => {
                // 관리자 페이지로 이동
                document.querySelectorAll('.page-section').forEach(sec => sec.classList.add('hidden'));
                document.getElementById('page-admin').classList.remove('hidden');
                
                // 네비게이션 비활성화
                document.querySelectorAll('.nav-item').forEach(nav => {
                    nav.classList.add('text-gray-500');
                    nav.style.color = '';
                });
            });
        }

        initMyPageEvents(true); 
    } else {
        // ... (비로그인 상태 기존 코드와 동일) ...
        profileArea.innerHTML = `
            <div class="w-24 h-24 rounded-full bg-gray-700 mb-4 border-4 border-white/5 overflow-hidden"><i class="fa-solid fa-user text-5xl text-gray-400 w-full h-full flex items-center justify-center mt-2"></i></div>
            <h2 class="text-2xl font-bold">Guest 님</h2>
            <p class="text-sm text-gray-400 mb-6">로그인이 필요합니다.</p>
            <button id="btn-login-modal" class="bg-olive text-white font-bold py-3 px-8 rounded-full text-sm hover:opacity-90 transition w-full max-w-[240px] shadow-lg"><i class="fa-solid fa-key mr-2"></i> 로그인 / 회원가입</button>
        `;
        document.getElementById('btn-login-modal').addEventListener('click', showLoginModal);
        initMyPageEvents(false);
    }
}

// ============================================================
// 3. 메인 UI 로직
// ============================================================
export function updateMainHeader(coins) {
    const userData = getCurrentUserData();
    const homeCash = document.getElementById('home-cash');
    const homeTotal = document.getElementById('home-total-asset');
    
    let displayCash = 0;
    let displayTotal = 0;

    if (userData) {
        // [안전장치] 숫자로 변환 (데이터가 없거나 깨졌을 경우 0원 처리)
        displayCash = Number(userData.cash) || 0;
        displayTotal = Number(userData.cash) || 0;

        if(coins && userData.holdings) {
            Object.keys(userData.holdings).forEach(coinId => {
                const holding = userData.holdings[coinId];
                if(holding) {
                    const qty = Number(holding.qty) || 0;
                    const coin = coins.find(c => c.id === coinId);
                    if(coin) {
                        displayTotal += (qty * coin.price);
                    }
                }
            });
        }
    }

    if(homeCash) homeCash.innerText = `${formatNum(displayCash)} 원`;
    if(homeTotal) homeTotal.innerText = `${formatNum(displayTotal)} 원`;

    const assetPageTotal = document.getElementById('asset-total-amount');
    if(assetPageTotal) assetPageTotal.innerText = `${formatNum(displayTotal)} 원`;
    
    const rankMyAsset = document.getElementById('rank-my-asset');
    if(rankMyAsset) rankMyAsset.innerText = `${formatNum(displayTotal)} 원`;
}

export function renderCoinList(coins) {
    updateMainHeader(coins);
    const container = document.getElementById('coin-list-container');
    if(!container) return; 
    container.innerHTML = ''; 

    coins.forEach(coin => {
        const textColor = coin.type === 'up' ? 'text-up' : (coin.type === 'down' ? 'text-down' : 'text-gray-400');
        const changeSign = coin.change > 0 ? '+' : '';
        const html = `
            <div class="glass rounded-xl p-4 flex items-center justify-between hover:bg-white/5 transition cursor-pointer active:scale-95 coin-item" data-id="${coin.id}">
                <div class="flex items-center">
                    <div class="w-11 h-11 rounded-full bg-${coin.color}-500/20 flex items-center justify-center mr-3 border border-${coin.color}-500/30"><i class="fa-solid ${coin.icon} text-${coin.color}-400 text-lg"></i></div>
                    <div><p class="font-bold">${coin.name}</p><p class="text-xs text-gray-400">${coin.desc}</p></div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-lg coin-price">${formatNum(coin.price)}</p>
                    <p class="text-xs font-bold ${textColor} coin-change">${changeSign}${coin.change}%</p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    document.querySelectorAll('.coin-item').forEach(item => {
        item.addEventListener('click', () => {
            const coinId = item.getAttribute('data-id');
            openTradeModal(coinId);
        });
    });
}

// 실시간 UI 업데이트
export function updateCoinListUI(coins) {
    const userData = getCurrentUserData();
    updateMainHeader(coins); 

    if(!document.getElementById('page-home').classList.contains('hidden')) {
        coins.forEach(coin => {
            const item = document.querySelector(`.coin-item[data-id="${coin.id}"]`);
            if(!item) return;
            const priceEl = item.querySelector('.coin-price');
            const changeEl = item.querySelector('.coin-change');
            if(priceEl) priceEl.innerText = formatNum(coin.price);
            if(changeEl) {
                const sign = coin.change > 0 ? '+' : '';
                changeEl.innerText = `${sign}${coin.change}%`;
                changeEl.className = `text-xs font-bold coin-change ${coin.type === 'up' ? 'text-up' : (coin.type === 'down' ? 'text-down' : 'text-gray-400')}`;
            }
        });
    }

    if(userData && !document.getElementById('page-assets').classList.contains('hidden')) {
        coins.forEach(coin => {
            const item = document.querySelector(`#my-asset-list .asset-coin-item[data-id="${coin.id}"]`);
            if(item) {
                const holding = userData.holdings[coin.id];
                if(holding && holding.qty > 0) {
                    const currentVal = holding.qty * coin.price;
                    const buyVal = holding.qty * holding.avgPrice;
                    const profit = currentVal - buyVal;
                    const profitRate = ((profit / buyVal) * 100).toFixed(2);
                    const isProfit = profit > 0;
                    const isLoss = profit < 0;
                    const colorClass = isProfit ? 'text-up' : (isLoss ? 'text-down' : 'text-gray-400');
                    const sign = isProfit ? '+' : '';
                    
                    const valEl = item.querySelector('.asset-current-val');
                    const rateEl = item.querySelector('.asset-profit-rate');
                    if(valEl) valEl.innerText = `${formatNum(currentVal)} 원`;
                    if(rateEl) {
                        rateEl.innerText = `${sign}${profitRate}% (${sign}${formatNum(profit)})`;
                        rateEl.className = `text-xs font-bold ${colorClass} asset-profit-rate`;
                    }
                }
            }
        });
    }

    const modalBackdrop = document.getElementById('trade-backdrop');
    if(modalBackdrop) {
        const activeCoinId = modalBackdrop.getAttribute('data-active-coin');
        const coin = coins.find(c => c.id === activeCoinId);
        if(coin) {
            const priceDisplay = document.getElementById('modal-price-display');
            const changeDisplay = document.getElementById('modal-change-display');
            if(priceDisplay) priceDisplay.innerText = `${formatNum(coin.price)} 원`;
            if(changeDisplay) {
                const sign = coin.change > 0 ? '+' : '';
                const colorClass = coin.type === 'up' ? 'text-up' : (coin.type === 'down' ? 'text-down' : 'text-gray-400');
                changeDisplay.innerText = `직전대비 ${sign}${coin.change}%`;
                changeDisplay.className = `text-sm font-bold ${colorClass}`;
            }
            if(window.coinChartInstance) {
                window.coinChartInstance.data.datasets[0].data = coin.history;
                window.coinChartInstance.data.datasets[0].borderColor = coin.type === 'up' ? '#ff4d4d' : (coin.type === 'down' ? '#4d79ff' : '#a0aec0');
                window.coinChartInstance.update('none');
            }
        }
    }
}

// ============================================================
// 4. [페이지] 내 자산
// ============================================================
function renderAssetPage() {
    const userData = getCurrentUserData();
    const container = document.getElementById('my-asset-list');
    container.innerHTML = '';

    if(!userData) { container.innerHTML = '<div class="text-center py-10">로그인이 필요합니다.</div>'; return; }

    const coins = getCoins();
    let chartLabels = ['현금'];
    let chartData = [userData.cash];
    let chartColors = ['#4ade80']; 

    const cashHtml = `
        <div class="glass rounded-xl p-4 flex items-center justify-between border-l-4 border-emerald-500/50">
            <div class="flex items-center">
                <div class="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mr-3 border border-emerald-500/30"><i class="fa-solid fa-won-sign text-emerald-400"></i></div>
                <div><p class="font-bold text-sm">보유 현금</p><p class="text-xs text-gray-400">자유 입출금</p></div>
            </div>
            <div class="text-right"><p class="font-bold text-emerald-400">${formatNum(userData.cash)} 원</p></div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', cashHtml);

    const assetTitleArea = document.querySelector('#page-assets h3');
    if(assetTitleArea && !assetTitleArea.querySelector('#btn-go-history')) {
        assetTitleArea.classList.add('flex', 'justify-between', 'items-center', 'pr-2');
        assetTitleArea.innerHTML = `
            <span>보유 자산 목록</span>
            <button id="btn-go-history" class="text-xs text-gray-400 hover:text-white transition flex items-center bg-white/5 px-3 py-1.5 rounded-lg border border-white/10"><i class="fa-solid fa-clock-rotate-left mr-2"></i>거래 내역</button>
        `;
        document.getElementById('btn-go-history').addEventListener('click', () => {
            document.getElementById('page-assets').classList.add('hidden');
            document.getElementById('page-history').classList.remove('hidden');
            renderHistoryPage();
        });
    }
    const btnBack = document.getElementById('btn-back-to-asset');
    if(btnBack) btnBack.onclick = () => {
        document.getElementById('page-history').classList.add('hidden');
        document.getElementById('page-assets').classList.remove('hidden');
    };

    Object.keys(userData.holdings).forEach(coinId => {
        const holding = userData.holdings[coinId];
        const qty = holding.qty;
        if(qty > 0) {
            const coin = getCoinById(coinId);
            const currentVal = qty * coin.price; 
            const buyVal = qty * holding.avgPrice; 
            const profit = currentVal - buyVal;
            const profitRate = ((profit / buyVal) * 100).toFixed(2);
            const isProfit = profit > 0;
            const isLoss = profit < 0;
            const colorClass = isProfit ? 'text-up' : (isLoss ? 'text-down' : 'text-gray-400');
            const sign = isProfit ? '+' : '';

            chartLabels.push(coin.name);
            chartData.push(currentVal);
            const colorMap = { 'red': '#f87171', 'blue': '#60a5fa', 'yellow': '#facc15', 'indigo': '#818cf8', 'pink': '#f472b6', 'teal': '#2dd4bf', 'orange': '#fb923c', 'purple': '#c084fc', 'gray': '#9ca3af', 'lime': '#84cc16', 'emerald': '#34d399', 'amber': '#fbbf24', 'cyan': '#22d3ee' };
            chartColors.push(colorMap[coin.color] || '#cbd5e1');

            const html = `
                <div class="glass rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition active:scale-95 asset-coin-item" data-id="${coin.id}">
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-full bg-${coin.color}-500/20 flex items-center justify-center mr-3 border border-${coin.color}-500/30"><i class="fa-solid ${coin.icon} text-${coin.color}-400"></i></div>
                        <div><p class="font-bold text-sm">${coin.name}</p><p class="text-xs text-gray-400">${formatNum(qty)}개 | 평단 ${formatNum(Math.floor(holding.avgPrice))}</p></div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold asset-current-val">${formatNum(currentVal)} 원</p>
                        <p class="text-xs font-bold ${colorClass} asset-profit-rate">${sign}${profitRate}% (${sign}${formatNum(profit)})</p>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        }
    });

    document.querySelectorAll('.asset-coin-item').forEach(item => {
        item.addEventListener('click', () => { openTradeModal(item.getAttribute('data-id')); });
    });
    renderDoughnutChart(chartLabels, chartData, chartColors);
}

function renderDoughnutChart(labels, data, colors) {
    const ctx = document.getElementById('assetDoughnutChart').getContext('2d');
    if(assetChart) assetChart.destroy();
    assetChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });
}

function renderHistoryPage() {
    const userData = getCurrentUserData();
    const container = document.getElementById('history-list');
    container.innerHTML = '';
    if (!userData || !userData.history || userData.history.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 py-20 flex flex-col items-center"><i class="fa-solid fa-clock-rotate-left text-4xl mb-4 opacity-50"></i><p>거래 내역이 없습니다.</p></div>`;
        return;
    }
    userData.history.forEach(log => {
        const isBuy = log.type === 'buy';
        const typeText = isBuy ? '매수' : '매도';
        const typeColor = isBuy ? 'text-red-400' : 'text-blue-400';
        const typeBg = isBuy ? 'bg-red-500/10 border-red-500/20' : 'bg-blue-500/10 border-blue-500/20';
        let profitDisplay = `<span class="text-gray-500">-</span>`;
        if(!isBuy) {
            const isGain = log.profitRate > 0;
            const sign = isGain ? '+' : '';
            const color = isGain ? 'text-up' : (log.profitRate < 0 ? 'text-down' : 'text-gray-400');
            profitDisplay = `<span class="${color} font-bold text-xs">${sign}${log.profitRate}%</span>`;
        }
        const html = `
            <div class="glass rounded-xl p-4 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg ${typeBg} border flex flex-col items-center justify-center"><span class="text-[10px] font-bold ${typeColor}">${typeText}</span></div>
                    <div><p class="font-bold text-sm">${log.name}</p><p class="text-[10px] text-gray-400">${log.date}</p></div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-sm">${formatNum(log.totalPrice)} 원</p>
                    <div class="flex justify-end gap-2 items-center"><span class="text-xs text-gray-400">${formatNum(log.price)}원 · ${formatNum(log.qty)}개</span><span class="w-[1px] h-2 bg-gray-600"></span>${profitDisplay}</div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

// [js/ui.js] renderRankingPage 함수 교체

// [js/ui.js] renderRankingPage 함수 전체 교체

// [js/ui.js] renderRankingPage 함수 전체 교체

async function renderRankingPage(type = 'total') {
    const container = document.getElementById('ranking-list');
    const tabs = document.querySelectorAll('#page-ranking button');
    
    // 탭 스타일
    if(type === 'total') {
        tabs[0].className = 'flex-1 py-2 text-sm font-bold bg-white/10 rounded-lg text-white shadow transition';
        tabs[1].className = 'flex-1 py-2 text-sm font-bold text-gray-400 transition';
    } else {
        tabs[0].className = 'flex-1 py-2 text-sm font-bold text-gray-400 transition';
        tabs[1].className = 'flex-1 py-2 text-sm font-bold bg-white/10 rounded-lg text-white shadow transition';
    }

    container.innerHTML = '<div class="text-center py-10 text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>랭킹 집계 중...</div>';

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        let users = [];
        
        // 1. 데이터 수집
        querySnapshot.forEach((doc) => {
            const data = doc.data();

            // ============================================================
            // [추가됨] 관리자 필터링: 관리자는 랭킹 리스트에 넣지 않음
            // ============================================================
            if (data.isAdmin === true || data.nickname === '관리자') {
                return; // 이 유저는 건너뜀
            }

            const assetForRank = data.hourlyAsset || data.totalAsset || 500000;
            const profitForRank = data.yesterdayProfit || 0;

            users.push({
                name: data.nickname || "익명",
                asset: assetForRank,
                profit: profitForRank,
                uid: data.uid
            });
        });

        // 2. 정렬
        if(type === 'total') {
            users.sort((a, b) => b.asset - a.asset);
        } else {
            users.sort((a, b) => b.profit - a.profit);
        }

        // 3. 내 랭킹 찾기 (관리자라면 랭킹에 없으므로 '순위 없음' 처리됨)
        const myData = getCurrentUserData();
        const myRankInfo = { rank: '-', name: 'Guest', asset: 0, percent: '로그인 필요' };

        if (myData) {
            // 정렬된 리스트에서 내 위치 찾기
            const myIndex = users.findIndex(u => u.uid === myData.uid);
            
            if (myIndex !== -1) {
                const rank = myIndex + 1;
                const totalUsers = users.length;
                let percentage = (rank / totalUsers) * 100;
                if (percentage < 0.01) percentage = 0.01;
                
                myRankInfo.rank = `${rank}위`;
                myRankInfo.name = myData.nickname;
                myRankInfo.asset = (type === 'total') ? users[myIndex].asset : users[myIndex].profit;
                myRankInfo.percent = `상위 ${percentage.toFixed(2)}%`;
            } else {
                // 관리자거나 순위권 밖인 경우
                myRankInfo.name = myData.nickname;
                myRankInfo.percent = myData.isAdmin ? '관리자 (랭킹 제외)' : '순위권 밖';
                
                // 자산은 표시해줌
                let myCurrentAsset = myData.cash;
                // 실시간 자산 계산 로직이 필요하다면 여기서 추가 가능하지만, 
                // 간단히 현재 저장된 값 사용 (관리자는 보통 테스트용이라 정확도 덜 중요)
                myRankInfo.asset = myData.totalAsset || myData.cash; 
            }
        }

        // 4. 상단 내 정보 업데이트
        const myRankEl = document.getElementById('rank-my-rank');
        const myNickEl = document.getElementById('rank-my-nick');
        const myAssetEl = document.getElementById('rank-my-asset');
        const myPercentEl = document.getElementById('rank-my-percent');

        if(myRankEl) myRankEl.innerText = myRankInfo.rank;
        if(myNickEl) myNickEl.innerText = myRankInfo.name;
        if(myPercentEl) myPercentEl.innerText = myRankInfo.percent;
        
        if(myAssetEl) {
            let valStr = `${formatNum(myRankInfo.asset)} 원`;
            if(type === 'profit') {
                const sign = myRankInfo.asset > 0 ? '+' : '';
                const pColor = myRankInfo.asset > 0 ? 'text-up' : (myRankInfo.asset < 0 ? 'text-down' : 'text-gray-400');
                myAssetEl.innerHTML = `<span class="${pColor}">${sign}${valStr}</span>`;
            } else {
                myAssetEl.innerText = valStr;
            }
        }

        // 5. 리스트 렌더링
        const topUsers = users.slice(0, 100);
        
        container.innerHTML = '';
        if(topUsers.length === 0) {
            container.innerHTML = '<div class="text-center py-10 text-gray-500">랭킹 데이터가 없습니다.</div>';
            return;
        }

        topUsers.forEach((user, index) => {
            const rank = index + 1;
            let rankBadge = `<span class="font-bold w-6 text-center text-gray-500">${rank}</span>`;
            let color = 'text-gray-300';
            
            if(rank === 1) { rankBadge = `<i class="fa-solid fa-crown text-yellow-400 w-6 text-center"></i>`; color = 'text-yellow-400'; }
            if(rank === 2) { rankBadge = `<i class="fa-solid fa-medal text-gray-300 w-6 text-center"></i>`; color = 'text-gray-300'; }
            if(rank === 3) { rankBadge = `<i class="fa-solid fa-medal text-orange-400 w-6 text-center"></i>`; color = 'text-orange-400'; }

            const isMe = myData && myData.uid === user.uid;
            const bgClass = isMe ? 'bg-olive/20 border-olive/50' : 'glass';

            let valDisplay = `${formatNum(user.asset)} 원`;
            if(type === 'profit') {
                const sign = user.profit > 0 ? '+' : '';
                const pColor = user.profit > 0 ? 'text-up' : (user.profit < 0 ? 'text-down' : 'text-gray-400');
                valDisplay = `<span class="${pColor}">${sign}${formatNum(user.profit)} 원</span>`;
            }

            const html = `
                <div class="${bgClass} rounded-xl p-3 flex items-center justify-between border border-transparent mb-2">
                    <div class="flex items-center gap-3">
                        ${rankBadge}
                        <span class="font-bold text-sm ${color}">${user.name} ${isMe ? '<span class="text-xs text-olive ml-1">(나)</span>' : ''}</span>
                    </div>
                    <span class="font-bold text-sm text-gray-300">${valDisplay}</span>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });

    } catch (e) {
        console.error("랭킹 로드 실패", e);
        container.innerHTML = '<div class="text-center py-10 text-gray-500">랭킹을 불러오지 못했습니다.</div>';
    }
}

function showSystemModal(type, title, message, btnText, onConfirm) {
    const modalContainer = document.getElementById('modal-container');
    const isWarn = type === 'warn';
    const icon = isWarn ? 'fa-triangle-exclamation' : 'fa-circle-check';
    const colorText = isWarn ? 'text-red-400' : 'text-emerald-400';
    const btnClass = isWarn ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600';
    const cancelBtn = isWarn ? `<button id="sys-cancel" class="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 font-bold transition">취소</button>` : '';
    const confirmWidth = isWarn ? 'flex-1' : 'w-full';
    const html = `
        <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fade-in">
            <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" id="sys-backdrop"></div>
            <div class="glass w-full max-w-sm bg-[#1a1b2e]/95 rounded-3xl p-6 relative z-10 text-center animate-scale-up border border-white/10 shadow-2xl">
                <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10"><i class="fa-solid ${icon} text-3xl ${colorText}"></i></div>
                <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
                <p class="text-gray-400 text-sm mb-8 leading-relaxed">${message}</p>
                <div class="flex gap-3">${cancelBtn}<button id="sys-confirm" class="${confirmWidth} py-3.5 rounded-xl ${btnClass} text-white font-bold shadow-lg active:scale-95 transition">${btnText}</button></div>
            </div>
        </div>
    `;
    modalContainer.innerHTML = html;
    const close = () => { modalContainer.innerHTML = ''; document.body.style.overflow = 'auto'; };
    document.getElementById('sys-confirm').addEventListener('click', () => { close(); if(onConfirm) onConfirm(); });
    if(document.getElementById('sys-cancel')) document.getElementById('sys-cancel').addEventListener('click', close);
    if(!isWarn) document.getElementById('sys-backdrop').addEventListener('click', close);
}

export function openTradeModal(coinId) {
    const coin = getCoinById(coinId);
    const userData = getCurrentUserData();
    if (!coin || !userData) {
        if(!userData) showSystemModal('warn', '로그인 필요', '거래를 하려면 로그인이 필요합니다.', '확인');
        return;
    }

    const holding = userData.holdings[coinId];
    let currentHolding = holding ? holding.qty : 0;
    let currentCash = userData.cash;

    const modalContainer = document.getElementById('modal-container');
    const colorClass = coin.type === 'up' ? 'text-up' : (coin.type === 'down' ? 'text-down' : 'text-gray-400');
    
    const modalHtml = `
        <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in" id="trade-backdrop" data-active-coin="${coinId}">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
            <div class="glass w-full md:max-w-md bg-[#1a1b2e]/95 rounded-t-3xl md:rounded-3xl overflow-hidden relative z-10 animate-slide-up md:animate-scale-up border border-white/10">
                <div class="p-5 flex justify-between items-start border-b border-white/5">
                    <div>
                        <h3 class="text-2xl font-bold flex items-center mb-1"><i class="fa-solid ${coin.icon} text-${coin.color}-400 mr-2"></i> ${coin.name}</h3>
                        <div class="flex items-center text-sm text-gray-400 space-x-3">
                            <p>보유: <span class="text-white font-bold" id="modal-holding">${formatNum(currentHolding)}개</span></p>
                            <span class="w-[1px] h-3 bg-gray-600"></span>
                            <p>현금: <span class="text-emerald-400 font-bold" id="modal-cash">${formatNum(currentCash)}원</span></p>
                        </div>
                    </div>
                    <button id="close-modal-btn" class="text-gray-400 hover:text-white p-2"><i class="fa-solid fa-xmark text-xl"></i></button>
                </div>
                <div class="p-5 pb-0">
                    <div class="mb-4">
                        <span class="text-3xl font-bold block" id="modal-price-display">${formatNum(coin.price)} 원</span>
                        <span class="text-sm font-bold ${colorClass}" id="modal-change-display">직전대비 ${coin.change > 0 ? '+' : ''}${coin.change}%</span>
                    </div>
                    <div class="w-full h-48 glass rounded-2xl flex items-center justify-center relative overflow-hidden p-2">
                        <canvas id="coinChart"></canvas>
                    </div>
                </div>
                <div class="p-5 pt-6 bg-black/20 mt-4 rounded-t-3xl md:rounded-none">
                    <div class="flex mb-5 glass rounded-full p-1 relative">
                        <button id="tab-buy" class="flex-1 py-2 rounded-full text-sm font-bold transition text-white bg-red-500 shadow-lg">매수 (사기)</button>
                        <button id="tab-sell" class="flex-1 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-white transition">매도 (팔기)</button>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <div class="flex justify-between items-center mb-1 ml-1">
                                <label class="text-xs text-gray-400">주문 수량</label>
                                <span id="trade-status-msg" class="text-xs text-olive font-bold"></span>
                            </div>
                            <div class="relative flex items-center">
                                <input type="number" id="trade-quantity" placeholder="0" class="no-spinner w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-24 py-3 text-white font-bold outline-none focus:border-olive transition text-right" min="0">
                                <div class="absolute right-2 flex items-center space-x-2">
                                    <span class="text-sm font-bold text-gray-400">개</span>
                                    <button id="btn-max" class="bg-white/10 hover:bg-white/20 text-xs text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-lg font-bold transition">최대</button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs text-gray-400 mb-1 block ml-1">총 주문 금액</label>
                            <div class="glass rounded-xl px-4 py-3 flex justify-between items-center bg-black/40">
                                <span class="text-gray-500 text-sm font-bold whitespace-nowrap">합계</span>
                                <div class="flex items-center justify-end w-full">
                                    <input type="text" id="trade-total-price" value="0" readonly class="bg-transparent text-right font-bold text-xl text-white outline-none w-full cursor-default">
                                    <span class="text-sm font-bold text-white ml-1 whitespace-nowrap">원</span>
                                </div>
                            </div>
                        </div>
                        <button id="btn-submit" class="w-full py-4 rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold text-lg shadow-lg shadow-red-500/20 active:scale-95 transition mt-2">매수하기</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    modalContainer.innerHTML = modalHtml;
    document.body.style.overflow = 'hidden';

    const ctx = document.getElementById('coinChart').getContext('2d');
    const color = coin.type === 'up' ? '#ff4d4d' : (coin.type === 'down' ? '#4d79ff' : '#a0aec0');
    const gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, color + '50');
    gradient.addColorStop(1, color + '00');
    window.coinChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: new Array(30).fill(''), datasets: [{ data: coin.history, borderColor: color, backgroundColor: gradient, fill: true, pointRadius: 0, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, scales: { x: { display: false }, y: { display: false } }, animation: false }
    });

    const els = {
        qty: document.getElementById('trade-quantity'),
        total: document.getElementById('trade-total-price'),
        btnMax: document.getElementById('btn-max'),
        tabBuy: document.getElementById('tab-buy'),
        tabSell: document.getElementById('tab-sell'),
        submit: document.getElementById('btn-submit'),
        msg: document.getElementById('trade-status-msg')
    };
    let currentMode = 'buy'; 

    const updateUI = () => {
        const qty = parseInt(els.qty.value) || 0;
        const total = qty * coin.price;
        els.total.value = formatNum(total);
        if (currentMode === 'buy') {
            const maxBuyable = Math.floor(userData.cash / coin.price);
            els.msg.innerText = `최대 ${formatNum(maxBuyable)}개 구매 가능`;
        } else {
            const currentQty = userData.holdings[coinId] ? userData.holdings[coinId].qty : 0;
            els.msg.innerText = `최대 ${formatNum(currentQty)}개 판매 가능`;
        }
    };
    const setMode = (mode) => {
        currentMode = mode;
        els.qty.value = '';
        updateUI();
        if (mode === 'buy') {
            els.tabBuy.className = "flex-1 py-2 rounded-full text-sm font-bold transition text-white bg-red-500 shadow-lg";
            els.tabSell.className = "flex-1 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-white transition";
            els.submit.innerText = "매수하기";
            els.submit.className = "w-full py-4 rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold text-lg shadow-lg shadow-red-500/20 active:scale-95 transition mt-2";
        } else {
            els.tabBuy.className = "flex-1 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-white transition";
            els.tabSell.className = "flex-1 py-2 rounded-full text-sm font-bold transition text-white bg-blue-500 shadow-lg";
            els.submit.innerText = "매도하기";
            els.submit.className = "w-full py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold text-lg shadow-lg shadow-blue-500/20 active:scale-95 transition mt-2";
        }
    };
    const closeModal = () => { modalContainer.innerHTML = ''; document.body.style.overflow = 'auto'; if(window.coinChartInstance) { window.coinChartInstance.destroy(); } };

    els.tabBuy.addEventListener('click', () => setMode('buy'));
    els.tabSell.addEventListener('click', () => setMode('sell'));
    els.qty.addEventListener('input', updateUI);
    els.btnMax.addEventListener('click', () => {
        if (currentMode === 'buy') els.qty.value = Math.floor(userData.cash / coin.price);
        else els.qty.value = userData.holdings[coinId] ? userData.holdings[coinId].qty : 0;
        updateUI();
    });

    els.submit.addEventListener('click', async () => {
        const qty = parseInt(els.qty.value) || 0;
        if (qty <= 0) return;
        const totalPrice = qty * coin.price;
        const now = new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let newCash = userData.cash;
        let newHoldings = { ...userData.holdings };
        let newHistory = [...userData.history];
        
        let realizedProfit = 0; // 이번 거래로 얻은 실현 수익

        if (currentMode === 'buy') {
            if (newCash < totalPrice) return;
            const oldHolding = newHoldings[coinId] || { qty: 0, avgPrice: 0 };
            const oldQty = oldHolding.qty;
            const oldAvg = oldHolding.avgPrice;
            const newQty = oldQty + qty;
            const newAvg = ((oldQty * oldAvg) + (qty * coin.price)) / newQty;

            newCash -= totalPrice;
            newHoldings[coinId] = { qty: newQty, avgPrice: newAvg };
            
            newHistory.unshift({ type: 'buy', name: coin.name, price: coin.price, qty: qty, totalPrice: totalPrice, date: now, profitRate: 0 });
        } else {
            const holding = newHoldings[coinId];
            const currentQty = holding ? holding.qty : 0;
            if (currentQty < qty) return;

            // [핵심] 매도 실현 수익 계산: (판매가 - 평단가) * 수량
            realizedProfit = (coin.price - holding.avgPrice) * qty;
            
            const profit = totalPrice - (qty * holding.avgPrice);
            const profitRate = ((profit / (qty * holding.avgPrice)) * 100).toFixed(2);

            holding.qty -= qty;
            if(holding.qty === 0) holding.avgPrice = 0; 
            newCash += totalPrice;

            newHistory.unshift({ type: 'sell', name: coin.name, price: coin.price, qty: qty, totalPrice: totalPrice, date: now, profitRate: profitRate });
        }

        if(newHistory.length > 100) newHistory.pop();

        try {
            // [핵심] todayProfit 업데이트 (매도일 때만 realizedProfit이 더해짐)
            let currentTodayProfit = userData.todayProfit || 0;
            let newTodayProfit = currentTodayProfit + realizedProfit;

            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                cash: newCash,
                holdings: newHoldings,
                history: newHistory,
                todayProfit: newTodayProfit // 업데이트된 수익 저장
            });
            closeModal();
            showResultModal(currentMode, coin.name, qty, totalPrice);
        } catch(e) {
            console.error("거래 저장 실패", e);
            showSystemModal('warn', '오류', '거래 저장에 실패했습니다.', '닫기');
        }
    });

    document.getElementById('close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('trade-backdrop').addEventListener('click', (e) => { if(e.target === e.currentTarget) closeModal(); });
    setMode('buy');
}

function showResultModal(type, coinName, qty, totalPrice) {
    const modalContainer = document.getElementById('modal-container');
    const isBuy = type === 'buy';
    const title = isBuy ? '매수 주문 완료' : '매도 주문 완료';
    const colorText = isBuy ? 'text-red-400' : 'text-blue-400';
    const btnGradient = isBuy ? 'from-red-500 to-orange-500' : 'from-blue-500 to-indigo-500';
    const icon = isBuy ? 'fa-bag-shopping' : 'fa-hand-holding-dollar';

    const html = `
        <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="result-backdrop"></div>
            <div class="glass w-full max-w-sm bg-[#1a1b2e]/95 rounded-3xl p-6 relative z-10 text-center animate-scale-up border border-white/10 shadow-2xl">
                <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10"><i class="fa-solid ${icon} text-3xl ${colorText}"></i></div>
                <h3 class="text-xl font-bold text-white mb-2">${title}</h3>
                <p class="text-gray-400 text-sm mb-6">주문이 정상적으로 체결되었습니다.</p>
                <div class="glass rounded-xl p-5 mb-6 bg-black/20 text-left space-y-3">
                    <div class="flex justify-between items-center"><span class="text-gray-400 text-sm">종목명</span><span class="font-bold text-white">${coinName}</span></div>
                    <div class="flex justify-between items-center"><span class="text-gray-400 text-sm">체결 수량</span><span class="font-bold ${colorText}">${formatNum(qty)} 개</span></div>
                    <div class="w-full h-[1px] bg-white/10 my-1"></div>
                    <div class="flex justify-between items-center"><span class="text-gray-400 text-sm">총 거래금액</span><span class="font-bold text-white text-lg">${formatNum(totalPrice)} 원</span></div>
                </div>
                <button id="btn-confirm" class="w-full py-3.5 rounded-xl bg-gradient-to-r ${btnGradient} text-white font-bold shadow-lg active:scale-95 transition">확인</button>
            </div>
        </div>
    `;
    modalContainer.innerHTML = html;
    const close = () => { modalContainer.innerHTML = ''; document.body.style.overflow = 'auto'; };
    document.getElementById('btn-confirm').addEventListener('click', close);
    document.getElementById('result-backdrop').addEventListener('click', close);
}

// [js/ui.js] 맨 아래에 추가하세요.

// 마이페이지 이벤트 초기화 (회원탈퇴 버튼 등)
function initMyPageEvents(isLoggedIn) {
    const myPageSection = document.getElementById('page-mypage');
    if(!myPageSection) return;

    const deleteBtnDiv = myPageSection.querySelector('.group');
    if(deleteBtnDiv) {
        const newBtn = deleteBtnDiv.cloneNode(true);
        deleteBtnDiv.parentNode.replaceChild(newBtn, deleteBtnDiv);

        if(isLoggedIn) {
            newBtn.innerHTML = `
                <span class="text-sm font-bold group-hover:text-red-400 transition flex items-center w-full">
                    <i class="fa-solid fa-user-xmark mr-3 text-gray-400 group-hover:text-red-400"></i>회원 탈퇴
                </span>
                <i class="fa-solid fa-chevron-right text-gray-600 text-xs"></i>
            `;
            
            // [수정됨] 실제 탈퇴 함수 연결
            newBtn.onclick = () => {
                showSystemModal(
                    'warn', 
                    '정말로 탈퇴하시겠습니까?', 
                    '계정과 보유 자산이 영구적으로 삭제되며,<br>복구할 수 없습니다.', 
                    '탈퇴하기', 
                    () => {
                        // 확인 버튼 누르면 실행될 함수
                        handleWithdrawal(); 
                    }
                );
            };
        } else {
            newBtn.innerHTML = `<span class="text-sm font-bold text-gray-600">로그인 후 이용 가능</span>`;
            newBtn.onclick = null;
        }
    }
}