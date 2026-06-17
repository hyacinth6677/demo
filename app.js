// ===== Supabase 配置 =====
var SUPABASE_URL = 'https://pxizkofagxnvbmxljmtp.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4aXprb2ZhZ3hudmJteGxqbXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNTk1MTMsImV4cCI6MjA5NjczNTUxM30.Mnfdd0wyLWLVsIU5d34eUJ0oqBE9Kt7wxwLWwly-vAM';

// 先保存真正的 Supabase 库（防止下面的 var 声明覆盖 window.supabase）
var SupabaseLib = (window.supabase && window.supabase.createClient) ? window.supabase : null;

var supabase = null;
var dbReady = false;
try {
    if (SupabaseLib && SupabaseLib.createClient) {
        supabase = SupabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        dbReady = true;
    }
} catch (e) {
    console.error('Supabase init failed:', e);
}

var ADMIN_PASSWORD = '1234';
var deviceId = localStorage.getItem('grouping_device_id');
if (!deviceId) {
    deviceId = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('grouping_device_id', deviceId);
}

var globalSettings = { allow_duplicate: false, allow_edit: false, mode: 'group', lottery_type: 'realtime' };
var isEditing = false;
var currentFormFields = [];
var currentPrizes = [];

// ===== 页面切换 =====
function switchTab(tab) {
    if (tab === 'admin') {
        document.getElementById('password-mask').classList.add('show');
        document.getElementById('admin-password').value = '';
        setTimeout(function() { document.getElementById('admin-password').focus(); }, 100);
        return;
    }
    document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById(tab + '-section').classList.add('active');
    if (tab === 'join') refreshJoinPage();
}

function backToJoin() {
    document.getElementById('password-mask').classList.remove('show');
    document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById('join-section').classList.add('active');
    refreshJoinPage();
}

function checkPassword() {
    var input = document.getElementById('admin-password').value;
    if (input === ADMIN_PASSWORD) {
        document.getElementById('password-mask').classList.remove('show');
        document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('admin-section').classList.add('active');
        loadAdminData();
    } else {
        alert('密码错误！');
    }
}

// ===== 模式管理 =====
function setMode(mode) {
    if (!dbReady || !supabase) { alert('数据库未就绪'); return; }
    supabase.from('settings').upsert({ id: 1, mode: mode }).then(function(result) {
        if (result.error) { alert('切换失败: ' + result.error.message); return; }
        globalSettings.mode = mode;
        updateModeUI();
        refreshJoinPage();
    });
}

function setLotteryType(type) {
    if (!dbReady || !supabase) { alert('数据库未就绪'); return; }
    supabase.from('settings').upsert({ id: 1, lottery_type: type }).then(function(result) {
        if (result.error) { alert('设置失败: ' + result.error.message); return; }
        globalSettings.lottery_type = type;
        updateLotteryTypeUI();
        refreshJoinPage();
    });
}

function updateModeUI() {
    var isGroup = globalSettings.mode === 'group';
    document.getElementById('mode-badge-group').classList.toggle('hidden', !isGroup);
    document.getElementById('mode-badge-lottery').classList.toggle('hidden', isGroup);
    document.getElementById('group-settings').classList.toggle('hidden', !isGroup);
    document.getElementById('lottery-settings').classList.toggle('hidden', isGroup);
    document.getElementById('group-participants-card').classList.toggle('hidden', !isGroup);
    document.getElementById('lottery-participants-card').classList.toggle('hidden', isGroup);
    document.getElementById('admin-count-label').textContent = isGroup ? '报名人数' : '参与人数';
    document.getElementById('admin-label2').textContent = isGroup ? '分组数' : '奖品数';
    document.getElementById('admin-qr-tip').textContent = isGroup ? '让参与者扫描上方二维码报名' : '让参与者扫描上方二维码抽奖';
}

function updateLotteryTypeUI() {
    var isRealtime = globalSettings.lottery_type === 'realtime';
    document.getElementById('btn-realtime').className = isRealtime ? 'btn btn-small btn-primary' : 'btn btn-small btn-secondary';
    document.getElementById('btn-manual').className = isRealtime ? 'btn btn-small btn-secondary' : 'btn btn-small btn-primary';
    document.getElementById('manual-draw-btn').style.display = isRealtime ? 'none' : 'block';
}

// ===== 加载管理数据 =====
function loadAdminData() {
    if (!dbReady || !supabase) {
        document.getElementById('admin-db-error').classList.remove('hidden');
        return;
    }
    document.getElementById('admin-db-error').classList.add('hidden');
    loadSettings().then(function() {
        updateModeUI();
        updateLotteryTypeUI();
        if (globalSettings.mode === 'group') {
            loadParticipants();
        } else {
            loadPrizes();
            loadFormFields();
            loadLotteryParticipants();
        }
        generateQRAdmin();
    });
}

function loadSettings() {
    if (!dbReady || !supabase) return Promise.resolve();
    return supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(function(result) {
        if (result.error) { console.error('loadSettings error:', result.error); return; }
        if (result.data) {
            globalSettings = Object.assign(globalSettings, result.data);
            document.getElementById('setting-duplicate').checked = !!result.data.allow_duplicate;
            document.getElementById('setting-edit').checked = !!result.data.allow_edit;
        } else {
            supabase.from('settings').insert({ id: 1, mode: 'group', lottery_type: 'realtime', allow_duplicate: false, allow_edit: false });
        }
    });
}

function saveSettings() {
    if (!dbReady || !supabase) return;
    var allowDuplicate = document.getElementById('setting-duplicate').checked;
    var allowEdit = document.getElementById('setting-edit').checked;
    supabase.from('settings').upsert({
        id: 1, allow_duplicate: allowDuplicate, allow_edit: allowEdit,
        mode: globalSettings.mode, lottery_type: globalSettings.lottery_type
    }).then(function(result) {
        if (result.error) alert('保存失败: ' + result.error.message);
        else {
            globalSettings.allow_duplicate = allowDuplicate;
            globalSettings.allow_edit = allowEdit;
        }
    });
}

// ===== 分组功能 =====
function loadParticipants() {
    if (!dbReady || !supabase) { showSyncStatus('数据库未就绪', false); return; }
    showSyncStatus('同步中...', true);
    supabase.from('participants').select('*').order('created_at', { ascending: true }).then(function(result) {
        if (result.error) { showSyncStatus('同步失败', false); return; }
        renderParticipantList(result.data || []);
        updateJoinCountDisplay((result.data || []).length);
        showSyncStatus('已同步', true);
    });
}

function submitJoin() {
    if (globalSettings.mode === 'lottery') {
        submitLottery();
        return;
    }
    var name = document.getElementById('participant-name').value.trim();
    if (!name) { alert('请输入姓名'); return; }
    if (!dbReady || !supabase) { alert('数据库未就绪'); return; }

    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(function(sResult) {
        var settings = sResult.data || { allow_duplicate: false };
        if (!settings.allow_duplicate) {
            supabase.from('participants').select('id').eq('user_id', deviceId).then(function(eResult) {
                if (eResult.data && eResult.data.length > 0) { alert('您已报名，请勿重复提交'); return; }
                doSubmit(name);
            });
        } else {
            doSubmit(name);
        }
    });
}

function doSubmit(name) {
    supabase.from('participants').insert([{ name: name, user_id: deviceId }]).then(function(result) {
        if (result.error) { alert('报名失败: ' + result.error.message); return; }
        document.getElementById('participant-name').value = '';
        document.getElementById('join-success').style.display = 'block';
        updateJoinCount();
        loadMyRecords();
        setTimeout(function() { document.getElementById('join-success').style.display = 'none'; }, 3000);
    });
}

function deletePerson(id) {
    if (!confirm('确定删除该人员？')) return;
    if (!dbReady || !supabase) return;
    supabase.from('participants').delete().eq('id', id).then(function(result) {
        if (result.error) alert('删除失败: ' + result.error.message);
        else loadParticipants();
    });
}

function clearAll() {
    if (!confirm('确定清空所有数据？此操作不可恢复！')) return;
    if (!dbReady || !supabase) return;
    supabase.from('participants').delete().neq('id', 0).then(function(result) {
        if (result.error) alert('清空失败: ' + result.error.message);
        else { loadParticipants(); updateJoinCount(); loadMyRecords(); }
    });
}

function renderParticipantList(data) {
    var listEl = document.getElementById('participant-list');
    if (!data || data.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg><div>暂无报名人员</div></div>';
    } else {
        var html = '';
        for (var i = 0; i < data.length; i++) {
            var p = data[i];
            html += '<div class="person-item"><div><div class="person-name">' + p.name + '</div><div class="person-time">' + new Date(p.created_at).toLocaleString('zh-CN') + '</div></div><button class="delete-btn" onclick="deletePerson(' + p.id + ')">删除</button></div>';
        }
        listEl.innerHTML = html;
    }
}

function updateJoinCountDisplay(count) {
    document.getElementById('admin-count').textContent = count;
    document.getElementById('join-count').textContent = count;
}

function updateJoinCount() {
    if (!dbReady || !supabase) { document.getElementById('join-count').textContent = '0'; return; }
    supabase.from('participants').select('*').then(function(result) {
        document.getElementById('join-count').textContent = (result.data || []).length;
    });
}

function showSyncStatus(text, isOnline) {
    var el = document.getElementById('sync-indicator');
    el.textContent = text;
    el.className = 'sync-status ' + (isOnline ? 'online' : 'offline');
}

function generateGroups() {
    if (!dbReady || !supabase) { alert('数据库未就绪'); return; }
    var size = parseInt(document.getElementById('group-size').value);
    if (!size || size < 2) { alert('每组至少2人'); return; }
    supabase.from('participants').select('*').then(function(result) {
        if (result.error) { alert('分组失败: ' + result.error.message); return; }
        var data = result.data || [];
        if (data.length === 0) { alert('暂无报名人员'); return; }
        var shuffled = data.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = temp;
        }
        var groups = [];
        for (var k = 0; k < shuffled.length; k += size) {
            groups.push(shuffled.slice(k, k + size));
        }
        renderGroups(groups);
        updateGroupNum(groups.length);
    });
}

function renderGroups(groups) {
    var container = document.getElementById('group-result');
    if (!groups || groups.length === 0) return;
    var html = '<div style="margin-bottom: 12px; font-weight: 600; color: #333;">分组结果（共 ' + groups.length + ' 组）：</div>';
    for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        html += '<div class="group-card group-color-' + (i % 8) + '"><div class="group-title"><span>第 ' + (i + 1) + ' 组</span><span style="font-size: 14px; opacity: 0.9;">(' + group.length + '人)</span></div><div class="group-members">';
        for (var j = 0; j < group.length; j++) {
            html += '<span class="member-tag">' + group[j].name + '</span>';
        }
        html += '</div></div>';
    }
    html += '<button class="btn btn-secondary" onclick="copyResult()">📋 复制分组结果</button>';
    container.innerHTML = html;
}

function updateGroupNum(num) { document.getElementById('group-num').textContent = num || 0; }

function copyResult() {
    var cards = document.querySelectorAll('.group-card');
    if (cards.length === 0) return;
    var text = '🎲 随机分组结果：\n\n';
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var title = card.querySelector('.group-title').textContent.trim();
        var tags = card.querySelectorAll('.member-tag');
        var members = [];
        for (var j = 0; j < tags.length; j++) members.push(tags[j].textContent);
        text += title + '：' + members.join('、') + '\n';
    }
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() { alert('已复制'); });
    } else {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('已复制');
    }
}

// ===== 抽奖功能 =====
function loadPrizes() {
    if (!dbReady || !supabase) return;
    supabase.from('prizes').select('*').order('created_at', { ascending: true }).then(function(result) {
        if (result.error) { console.error('loadPrizes error:', result.error); return; }
        currentPrizes = result.data || [];
        renderPrizes();
        document.getElementById('group-num').textContent = currentPrizes.length;
    });
}

function renderPrizes() {
    var container = document.getElementById('prize-list');
    if (!currentPrizes || currentPrizes.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; padding:12px;">暂无奖品</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < currentPrizes.length; i++) {
        var p = currentPrizes[i];
        html += '<div class="prize-item"><div><div class="person-name">' + p.name + '</div><div class="person-time">剩余 ' + p.remaining + ' / ' + p.quantity + ' 个</div></div><button class="delete-btn" onclick="deletePrize(' + p.id + ')">删除</button></div>';
    }
    container.innerHTML = html;
}

function addPrize() {
    var name = document.getElementById('prize-name').value.trim();
    var qty = parseInt(document.getElementById('prize-qty').value) || 1;
    if (!name) { alert('请输入奖品名称'); return; }
    if (!dbReady || !supabase) return;
    supabase.from('prizes').insert([{ name: name, quantity: qty, remaining: qty }]).then(function(result) {
        if (result.error) { alert('添加失败: ' + result.error.message); return; }
        document.getElementById('prize-name').value = '';
        document.getElementById('prize-qty').value = '1';
        loadPrizes();
    });
}

function deletePrize(id) {
    if (!confirm('确定删除该奖品？')) return;
    if (!dbReady || !supabase) return;
    supabase.from('prizes').delete().eq('id', id).then(function(result) {
        if (result.error) alert('删除失败: ' + result.error.message);
        else loadPrizes();
    });
}

function loadFormFields() {
    if (!dbReady || !supabase) return Promise.resolve();
    return supabase.from('form_fields').select('*').order('sort_order', { ascending: true }).then(function(result) {
        if (result.error) { console.error('loadFormFields error:', result.error); return; }
        currentFormFields = result.data || [];
        renderFormFields();
        buildJoinForm();
    });
}

function renderFormFields() {
    var container = document.getElementById('form-fields-list');
    if (!currentFormFields || currentFormFields.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; padding:12px;">暂无自定义字段</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < currentFormFields.length; i++) {
        var f = currentFormFields[i];
        html += '<div class="prize-item"><div><div class="person-name">' + f.label + ' <span style="color:#999; font-size:12px;">(' + f.field_key + ')</span></div><div class="person-time">' + (f.required ? '必填' : '选填') + '</div></div><button class="delete-btn" onclick="deleteFormField(' + f.id + ')">删除</button></div>';
    }
    container.innerHTML = html;
}

function addFormField() {
    var label = document.getElementById('field-label').value.trim();
    var key = document.getElementById('field-key').value.trim();
    var required = document.getElementById('field-required').checked;
    if (!label || !key) { alert('请填写字段名称和标识'); return; }
    if (!dbReady || !supabase) return;
    supabase.from('form_fields').insert([{ label: label, field_key: key, required: required, sort_order: currentFormFields.length }]).then(function(result) {
        if (result.error) { alert('添加失败: ' + result.error.message); return; }
        document.getElementById('field-label').value = '';
        document.getElementById('field-key').value = '';
        document.getElementById('field-required').checked = false;
        loadFormFields();
    });
}

function deleteFormField(id) {
    if (!confirm('确定删除该字段？')) return;
    if (!dbReady || !supabase) return;
    supabase.from('form_fields').delete().eq('id', id).then(function(result) {
        if (result.error) alert('删除失败: ' + result.error.message);
        else loadFormFields();
    });
}

function buildJoinForm() {
    var area = document.getElementById('join-form-area');
    // 保存当前输入值，防止重建时丢失
    var savedValues = {};
    var nameInput = document.getElementById('participant-name');
    if (nameInput) savedValues['__name__'] = nameInput.value;
    var existingFields = area.querySelectorAll('input[data-key]');
    for (var i = 0; i < existingFields.length; i++) {
        var el = existingFields[i];
        savedValues[el.getAttribute('data-key')] = el.value;
    }
    var html = '<div class="input-group"><label>姓名 <span style="color:#ef4444">*</span></label><input type="text" id="participant-name" placeholder="请输入真实姓名" maxlength="20"></div>';
    for (var i = 0; i < currentFormFields.length; i++) {
        var f = currentFormFields[i];
        html += '<div class="input-group"><label>' + f.label + (f.required ? ' <span style="color:#ef4444">*</span>' : '') + '</label><input type="text" id="field-' + f.field_key + '" placeholder="请输入' + f.label + '" data-key="' + f.field_key + '" data-required="' + f.required + '"></div>';
    }
    area.innerHTML = html;
    // 恢复输入值
    var newNameInput = document.getElementById('participant-name');
    if (newNameInput && savedValues['__name__']) newNameInput.value = savedValues['__name__'];
    for (var i = 0; i < currentFormFields.length; i++) {
        var f = currentFormFields[i];
        var el = document.getElementById('field-' + f.field_key);
        if (el && savedValues[f.field_key]) el.value = savedValues[f.field_key];
    }
}

function submitLottery() {
    var name = document.getElementById('participant-name').value.trim();
    if (!name) { alert('请输入姓名'); return; }
    if (!dbReady || !supabase) { alert('数据库未就绪'); return; }

    var customData = {};
    for (var i = 0; i < currentFormFields.length; i++) {
        var f = currentFormFields[i];
        var el = document.getElementById('field-' + f.field_key);
        var val = el ? el.value.trim() : '';
        if (f.required && !val) { alert('请填写' + f.label); return; }
        if (val) customData[f.field_key] = val;
    }

    supabase.from('lottery_participants').select('id').eq('user_id', deviceId).then(function(eResult) {
        if (eResult.data && eResult.data.length > 0) { alert('您已参与，请勿重复提交'); return; }
        doLotterySubmit(name, customData);
    });
}

function doLotterySubmit(name, customData) {
    var isRealtime = globalSettings.lottery_type === 'realtime';
    if (isRealtime) {
        supabase.from('prizes').select('*').gt('remaining', 0).order('created_at', { ascending: true }).then(function(pResult) {
            var prizes = pResult.data || [];
            var prizeName = '未中奖';
            var status = 'lost';
            var wonPrize = null;
            if (prizes.length > 0) {
                var randomIdx = Math.floor(Math.random() * prizes.length);
                wonPrize = prizes[randomIdx];
                prizeName = wonPrize.name;
                status = 'won';
                supabase.from('prizes').update({ remaining: wonPrize.remaining - 1 }).eq('id', wonPrize.id);
            }
            supabase.from('lottery_participants').insert([{
                name: name, user_id: deviceId, custom_data: customData, prize_name: prizeName, status: status
            }]).then(function(result) {
                if (result.error) { alert('参与失败: ' + result.error.message); return; }
                showLotteryResult(prizeName, status);
                updateLotteryCount();
                loadMyLotteryRecords();
            });
        });
    } else {
        supabase.from('lottery_participants').insert([{
            name: name, user_id: deviceId, custom_data: customData, prize_name: null, status: 'pending'
        }]).then(function(result) {
            if (result.error) { alert('参与失败: ' + result.error.message); return; }
            document.getElementById('lottery-pending-msg').style.display = 'block';
            setTimeout(function() { document.getElementById('lottery-pending-msg').style.display = 'none'; }, 3000);
            updateLotteryCount();
            loadMyLotteryRecords();
        });
    }
    document.getElementById('participant-name').value = '';
    for (var i = 0; i < currentFormFields.length; i++) {
        var el = document.getElementById('field-' + currentFormFields[i].field_key);
        if (el) el.value = '';
    }
}

function showLotteryResult(prizeName, status) {
    var area = document.getElementById('lottery-result-area');
    var emoji = document.getElementById('result-emoji');
    var text = document.getElementById('result-text');
    var sub = document.getElementById('result-sub');
    area.classList.remove('hidden');
    if (status === 'won' && prizeName !== '未中奖') {
        emoji.textContent = '🎉';
        text.textContent = '恭喜中奖！';
        text.style.color = '#4f46e5';
        sub.textContent = '您获得了：' + prizeName;
    } else {
        emoji.textContent = '😊';
        text.textContent = '谢谢参与';
        text.style.color = '#666';
        sub.textContent = '很遗憾，您未中奖';
    }
    setTimeout(function() { area.classList.add('hidden'); }, 5000);
}

function manualDraw() {
    if (!dbReady || !supabase) return;
    if (!confirm('确定现在开奖？')) return;
    supabase.from('lottery_participants').select('*').eq('status', 'pending').then(function(pResult) {
        var participants = pResult.data || [];
        if (participants.length === 0) { alert('暂无待开奖参与者'); return; }
        supabase.from('prizes').select('*').then(function(prResult) {
            var prizes = prResult.data || [];
            var prizePool = [];
            for (var i = 0; i < prizes.length; i++) {
                for (var j = 0; j < prizes[i].remaining; j++) prizePool.push(prizes[i]);
            }
            var shuffled = participants.slice();
            for (var k = shuffled.length - 1; k > 0; k--) {
                var r = Math.floor(Math.random() * (k + 1));
                var temp = shuffled[k]; shuffled[k] = shuffled[r]; shuffled[r] = temp;
            }
            var promises = [];
            for (var m = 0; m < shuffled.length; m++) {
                var p = shuffled[m];
                if (m < prizePool.length) {
                    var won = prizePool[m];
                    promises.push(supabase.from('lottery_participants').update({ prize_name: won.name, status: 'won' }).eq('id', p.id));
                    promises.push(supabase.from('prizes').update({ remaining: won.remaining - 1 }).eq('id', won.id));
                } else {
                    promises.push(supabase.from('lottery_participants').update({ prize_name: '未中奖', status: 'lost' }).eq('id', p.id));
                }
            }
            Promise.all(promises).then(function() {
                alert('开奖完成！共 ' + participants.length + ' 人参与，' + Math.min(prizePool.length, participants.length) + ' 人中奖');
                loadLotteryParticipants();
                loadPrizes();
            });
        });
    });
}

function loadLotteryParticipants() {
    if (!dbReady || !supabase) { showLotterySyncStatus('数据库未就绪', false); return; }
    showLotterySyncStatus('同步中...', true);
    supabase.from('lottery_participants').select('*').order('created_at', { ascending: false }).then(function(result) {
        if (result.error) { showLotterySyncStatus('同步失败', false); return; }
        renderLotteryList(result.data || []);
        updateLotteryCount();
        showLotterySyncStatus('已同步', true);
    });
}

function renderLotteryList(data) {
    var container = document.getElementById('lottery-list');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg><div>暂无参与者</div></div>';
        return;
    }
    var html = '';
    for (var i = 0; i < data.length; i++) {
        var p = data[i];
        var statusBadge = '';
        if (p.status === 'pending') statusBadge = '<span class="prize-pending">待开奖</span>';
        else if (p.status === 'won') statusBadge = '<span class="prize-won">🎁 ' + (p.prize_name || '中奖') + '</span>';
        else statusBadge = '<span class="prize-lost">未中奖</span>';
        var customInfo = '';
        if (p.custom_data) {
            var entries = Object.entries(p.custom_data);
            if (entries.length > 0) {
                var infoParts = [];
                for (var j = 0; j < entries.length; j++) infoParts.push(entries[j][0] + ': ' + entries[j][1]);
                customInfo = '<div style="font-size:11px; color:#999; margin-top:2px;">' + infoParts.join(' | ') + '</div>';
            }
        }
        html += '<div class="lottery-item"><div><div class="person-name">' + p.name + ' ' + statusBadge + '</div><div class="person-time">' + new Date(p.created_at).toLocaleString('zh-CN') + '</div>' + customInfo + '</div><button class="delete-btn" onclick="deleteLotteryPerson(' + p.id + ')">删除</button></div>';
    }
    container.innerHTML = html;
}

function deleteLotteryPerson(id) {
    if (!confirm('确定删除该参与者？')) return;
    if (!dbReady || !supabase) return;
    supabase.from('lottery_participants').delete().eq('id', id).then(function(result) {
        if (result.error) alert('删除失败: ' + result.error.message);
        else loadLotteryParticipants();
    });
}

function clearLottery() {
    if (!confirm('确定清空所有抽奖数据？此操作不可恢复！')) return;
    if (!dbReady || !supabase) return;
    supabase.from('lottery_participants').delete().neq('id', 0).then(function(result) {
        if (result.error) alert('清空失败: ' + result.error.message);
        else { loadLotteryParticipants(); updateLotteryCount(); loadMyLotteryRecords(); }
    });
}

function updateLotteryCount() {
    if (!dbReady || !supabase) { document.getElementById('join-count').textContent = '0'; return; }
    supabase.from('lottery_participants').select('*').then(function(result) {
        var count = (result.data || []).length;
        document.getElementById('join-count').textContent = count;
        document.getElementById('admin-count').textContent = count;
    });
}

function showLotterySyncStatus(text, isOnline) {
    var el = document.getElementById('lottery-sync-indicator');
    el.textContent = text;
    el.className = 'sync-status ' + (isOnline ? 'online' : 'offline');
}

function loadMyLotteryRecords() {
    if (!dbReady || !supabase) return;
    supabase.from('lottery_participants').select('*').eq('user_id', deviceId).order('created_at', { ascending: false }).then(function(result) {
        if (result.error) { console.error('loadMyLotteryRecords error:', result.error); return; }
        var data = result.data || [];
        var container = document.getElementById('my-records-list');
        if (data.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#999; font-size:13px; padding:12px;">暂无记录</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < data.length; i++) {
            var p = data[i];
            var status = '';
            if (p.status === 'pending') status = '<span style="color:#f59e0b;">待开奖</span>';
            else if (p.status === 'won') status = '<span style="color:#10b981; font-weight:600;">🎁 ' + (p.prize_name || '中奖') + '</span>';
            else status = '<span style="color:#999;">未中奖</span>';
            html += '<div class="record-item"><div><div class="record-name">' + p.name + ' - ' + status + '</div><div class="record-time">' + new Date(p.created_at).toLocaleString('zh-CN') + '</div></div></div>';
        }
        container.innerHTML = html;
    });
}

// ===== 我的记录（分组） =====
function loadMyRecords() {
    if (!dbReady || !supabase) return;
    supabase.from('participants').select('*').eq('user_id', deviceId).order('created_at', { ascending: false }).then(function(result) {
        if (result.error) { console.error('loadMyRecords error:', result.error); return; }
        var data = result.data || [];
        var container = document.getElementById('my-records-list');
        if (data.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#999; font-size:13px; padding:12px;">暂无记录</div>';
            return;
        }
        supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(function(sResult) {
            var allowEdit = sResult.data ? sResult.data.allow_edit : false;
            var html = '';
            for (var i = 0; i < data.length; i++) {
                var p = data[i];
                html += '<div class="record-item" id="record-' + p.id + '"><div><div class="record-name" id="name-display-' + p.id + '">' + p.name + '</div><div class="record-time">' + new Date(p.created_at).toLocaleString('zh-CN') + '</div></div><div class="record-actions">' + (allowEdit ? '<button class="edit-btn" onclick="startEdit(' + p.id + ', \'' + p.name + '\')">✏️ 修改</button>' : '') + '</div></div>';
            }
            container.innerHTML = html;
        });
    });
}

function startEdit(id, oldName) {
    isEditing = true;
    var displayEl = document.getElementById('name-display-' + id);
    var parent = displayEl.parentElement.parentElement;
    var actions = parent.querySelector('.record-actions');
    displayEl.style.display = 'none';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.style = 'padding:6px 10px; border:2px solid #4f46e5; border-radius:8px; font-size:14px; width:120px;';
    input.id = 'edit-input-' + id;
    displayEl.parentElement.insertBefore(input, displayEl);
    input.focus();
    actions.innerHTML = '<button class="save-btn" onclick="saveEdit(' + id + ')">💾 保存</button><button class="cancel-btn" onclick="cancelEdit(' + id + ', \'' + oldName + '\')">❌ 取消</button>';
}

function cancelEdit(id, oldName) {
    isEditing = false;
    var input = document.getElementById('edit-input-' + id);
    var displayEl = document.getElementById('name-display-' + id);
    if (input) input.remove();
    displayEl.style.display = 'block';
    var parent = displayEl.parentElement.parentElement;
    var actions = parent.querySelector('.record-actions');
    actions.innerHTML = '<button class="edit-btn" onclick="startEdit(' + id + ', \'' + oldName + '\')">✏️ 修改</button>';
}

function saveEdit(id) {
    var input = document.getElementById('edit-input-' + id);
    var newName = input.value.trim();
    if (!newName) { alert('姓名不能为空'); return; }
    supabase.from('participants').update({ name: newName }).eq('id', id).then(function(result) {
        if (result.error) { alert('修改失败: ' + result.error.message); return; }
        isEditing = false;
        loadMyRecords();
        updateJoinCount();
    });
}

// ===== 二维码 =====
function generateQRAdmin() {
    var container = document.getElementById('qrcode-admin');
    if (!container) return;
    container.innerHTML = '';
    try {
        var url = window.location.href.split('?')[0].split('#')[0];
        new QRCode(container, { text: url, width: 180, height: 180, colorDark: '#1a1a1a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    } catch (e) { console.error('QR生成失败:', e); }
}

function generateQRJoin() {
    var container = document.getElementById('qrcode-join');
    if (!container) return;
    container.innerHTML = '';
    try {
        var url = window.location.href.split('?')[0].split('#')[0];
        new QRCode(container, { text: url, width: 160, height: 160, colorDark: '#1a1a1a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    } catch (e) { console.error('QR生成失败:', e); }
}

// ===== 刷新参与页面 =====
function refreshJoinPage() {
    generateQRJoin();
    if (!dbReady || !supabase) {
        document.getElementById('db-error').classList.remove('hidden');
        return;
    }
    document.getElementById('db-error').classList.add('hidden');
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(function(result) {
        if (result.error) { console.error('refreshJoinPage error:', result.error); return; }
        var mode = result.data ? result.data.mode : 'group';
        var isGroup = mode === 'group';
        document.getElementById('join-title').textContent = isGroup ? '📝 活动报名' : '🎰 幸运抽奖';
        document.getElementById('join-subtitle').textContent = isGroup ? '填写姓名完成报名，等待管理员分组' : '填写信息参与抽奖，祝您好运！';
        document.getElementById('join-btn').textContent = isGroup ? '立即报名' : '参与抽奖';
        document.getElementById('qr-tip').textContent = isGroup ? '📲 扫描上方二维码报名' : '📲 扫描上方二维码参与抽奖';
        document.getElementById('lottery-result-area').classList.add('hidden');
        document.getElementById('lottery-pending-msg').style.display = 'none';
        if (isGroup) {
            updateJoinCount();
            loadMyRecords();
        } else {
            loadFormFields().then(function() {
                updateLotteryCount();
                loadMyLotteryRecords();
            });
        }
    });
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('group-size').addEventListener('input', function() {
        var size = parseInt(this.value) || 4;
        var count = parseInt(document.getElementById('admin-count').textContent) || 0;
        document.getElementById('group-num').textContent = count > 0 ? Math.ceil(count / size) : 0;
    });

    document.addEventListener('keypress', function(e) {
        if (e.target.id === 'participant-name' && e.key === 'Enter') submitJoin();
        if (e.target.id === 'admin-password' && e.key === 'Enter') checkPassword();
    });

    refreshJoinPage();

    setInterval(function() {
        if (isEditing) return;
        // 如果用户在参与页面且正在输入，不刷新以免清除表单内容
        var activeEl = document.activeElement;
        var isTypingInJoin = activeEl && activeEl.tagName === 'INPUT' &&
            document.getElementById('join-section').classList.contains('active');
        if (isTypingInJoin) return;
        if (document.getElementById('admin-section').classList.contains('active')) {
            if (globalSettings.mode === 'group') {
                loadParticipants();
                loadSettings();
            } else {
                loadLotteryParticipants();
                loadPrizes();
                loadSettings();
            }
        } else {
            refreshJoinPage();
        }
    }, 3000);
});
