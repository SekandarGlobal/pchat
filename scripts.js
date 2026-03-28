/* ============================================
   Firebase Configuration
   ============================================ */
const firebaseConfig = {
    apiKey: "AIzaSyBQn69HSj_p3K1FTpPiBZMgHlbj5MnnWg0",
    authDomain: "coinzo-1a2a8.firebaseapp.com",
    databaseURL: "https://coinzo-1a2a8-default-rtdb.firebaseio.com",
    projectId: "coinzo-1a2a8",
    storageBucket: "coinzo-1a2a8.firebasestorage.app",
    messagingSenderId: "655863310444",
    appId: "1:655863310444:web:eecf7db53e38bbbd8f5049",
    measurementId: "G-38422J73NZ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();

/* ============================================
   State
   ============================================ */
let currentUser = null;
let currentUserData = null;
let activeChatId = null;
let activeChatData = null;
let messagesUnsubscribe = null;
let typingTimeout = null;
let searchTimeout = null;
let editMessageId = null;
let groupSelectedMembers = [];

/* ============================================
   Navigation
   ============================================ */
function navigateTo(page) {
    document.querySelectorAll('.page').forEach(function(p) {
        p.classList.remove('active');
    });
    var el = document.getElementById('page-' + page);
    if (el) el.classList.add('active');
    clearErrors();
}

function clearErrors() {
    document.querySelectorAll('.error-msg').forEach(function(e) {
        e.classList.remove('active');
        e.textContent = '';
    });
}

function showError(id, message) {
    var el = document.getElementById(id);
    if (el) {
        el.textContent = message;
        el.classList.add('active');
    }
}

/* ============================================
   Auth State Listener
   ============================================ */
auth.onAuthStateChanged(async function(user) {
    if (user) {
        currentUser = user;
        try {
            var doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                var data = doc.data();
                if (data.name && data.username) {
                    currentUserData = data;
                    await loadChatPage();
                    navigateTo('chat');
                    setupPresence();
                } else if (data.name) {
                    navigateTo('setup-username');
                } else {
                    navigateTo('setup-name');
                }
            } else {
                navigateTo('setup-name');
            }
        } catch (err) {
            console.error('Auth state error:', err);
            navigateTo('setup-name');
        }
    } else {
        currentUser = null;
        currentUserData = null;
        cleanupListeners();
        navigateTo('landing');
    }
});

/* ============================================
   Authentication
   ============================================ */
async function handleSignIn(e) {
    e.preventDefault();
    clearErrors();
    var email = document.getElementById('signin-email').value.trim();
    var password = document.getElementById('signin-password').value;
    var btn = document.getElementById('signin-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        showError('signin-error', friendlyError(err.code));
    }
    btn.disabled = false;
    btn.textContent = 'Sign In';
}

async function handleSignUp(e) {
    e.preventDefault();
    clearErrors();
    var email = document.getElementById('signup-email').value.trim();
    var password = document.getElementById('signup-password').value;
    var btn = document.getElementById('signup-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';
    try {
        await auth.createUserWithEmailAndPassword(email, password);
    } catch (err) {
        showError('signup-error', friendlyError(err.code));
    }
    btn.disabled = false;
    btn.textContent = 'Sign Up';
}

async function signInWithGoogle() {
    clearErrors();
    var provider = new firebase.auth.GoogleAuthProvider();
    try {
        var result = await auth.signInWithPopup(provider);
        if (result.additionalUserInfo && result.additionalUserInfo.isNewUser) {
            var name = result.user.displayName || '';
            await db.collection('users').doc(result.user.uid).set({
                name: name,
                email: result.user.email,
                username: '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            if (name) {
                navigateTo('setup-username');
            } else {
                navigateTo('setup-name');
            }
        }
    } catch (err) {
        console.error('Google sign-in error:', err);
    }
}

async function signOutUser() {
    if (currentUser) {
        try {
            await rtdb.ref('online/' + currentUser.uid).remove();
            await rtdb.ref('typing/' + currentUser.uid).remove();
        } catch (_) {}
    }
    await auth.signOut();
}

function friendlyError(code) {
    switch (code) {
        case 'auth/user-not-found': return 'No account found with this email.';
        case 'auth/wrong-password': return 'Incorrect password.';
        case 'auth/email-already-in-use': return 'This email is already registered.';
        case 'auth/weak-password': return 'Password must be at least 6 characters.';
        case 'auth/invalid-email': return 'Invalid email address.';
        case 'auth/popup-closed-by-user': return 'Sign-in popup was closed.';
        case 'auth/too-many-requests': return 'Too many attempts. Try again later.';
        default: return 'An error occurred. Please try again.';
    }
}

/* ============================================
   Profile Setup
   ============================================ */
async function submitName(e) {
    e.preventDefault();
    clearErrors();
    var name = document.getElementById('setup-name').value.trim();
    if (!name) {
        showError('name-error', 'Please enter your name.');
        return;
    }
    try {
        await db.collection('users').doc(currentUser.uid).set({
            name: name,
            email: currentUser.email,
            username: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        navigateTo('setup-username');
    } catch (err) {
        showError('name-error', 'Could not save name. Try again.');
    }
}

async function submitUsername(e) {
    e.preventDefault();
    clearErrors();
    var username = document.getElementById('setup-username').value.trim().toLowerCase();
    var btn = document.getElementById('username-btn');
    if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
        showError('username-error', 'Only letters, numbers, and underscores allowed.');
        return;
    }
    if (username.length < 3) {
        showError('username-error', 'Username must be at least 3 characters.');
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Checking...';
    try {
        var existing = await db.collection('users')
            .where('username', '==', username)
            .limit(1)
            .get();
        if (!existing.empty && existing.docs[0].id !== currentUser.uid) {
            showError('username-error', 'This username is already taken.');
            btn.disabled = false;
            btn.textContent = 'Finish Setup';
            return;
        }
        await db.collection('users').doc(currentUser.uid).update({ username: username });
        currentUserData = { ...currentUserData, username: username };
        await loadChatPage();
        navigateTo('chat');
        setupPresence();
    } catch (err) {
        showError('username-error', 'Could not save username. Try again.');
    }
    btn.disabled = false;
    btn.textContent = 'Finish Setup';
}

/* ============================================
   Presence (Realtime Database)
   ============================================ */
function setupPresence() {
    if (!currentUser) return;
    var uid = currentUser.uid;
    var onlineRef = rtdb.ref('online/' + uid);
    onlineRef.set({
        online: true,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    onlineRef.onDisconnect().set({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

function listenForPresence(userId, callback) {
    return rtdb.ref('online/' + userId).on('value', function(snap) {
        callback(snap.val());
    });
}

/* ============================================
   Chat Management
   ============================================ */
async function loadChatPage() {
    var doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
        currentUserData = doc.data();
    }
    loadChatList();
}

async function startChat(userId) {
    if (userId === currentUser.uid) return;
    var q = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .where('type', '==', 'direct');
    var snapshot = await q.get();
    var found = null;
    snapshot.forEach(function(doc) {
        var parts = doc.data().participants;
        if (parts.length === 2 && parts.indexOf(userId) !== -1) {
            found = doc;
        }
    });
    if (found) {
        openChat(found.id);
    } else {
        var ref = await db.collection('chats').add({
            participants: [currentUser.uid, userId],
            type: 'direct',
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessage: '',
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
        });
        openChat(ref.id);
    }
    clearSearch();
    document.getElementById('user-search').value = '';
}

async function loadChatList() {
    var container = document.getElementById('chat-list');
    db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('lastMessageTime', 'desc')
        .onSnapshot(async function(snapshot) {
            container.innerHTML = '';
            if (snapshot.empty) {
                container.innerHTML = '<div class="chat-list-empty">No conversations yet.<br>Search for users to start chatting.</div>';
                return;
            }
            for (var i = 0; i < snapshot.docs.length; i++) {
                var doc = snapshot.docs[i];
                var chat = doc.data();
                var item = await createChatListItem(doc.id, chat);
                container.appendChild(item);
            }
        }, function(err) {
            console.error('Chat list error:', err);
        });
}

async function createChatListItem(chatId, chat) {
    var item = document.createElement('div');
    item.className = 'chat-list-item';
    if (chatId === activeChatId) item.classList.add('active');
    item.onclick = function() { openChat(chatId); };

    var name = 'Chat';
    var initial = '?';

    if (chat.type === 'group') {
        name = chat.name || 'Group';
        initial = name.charAt(0).toUpperCase();
    } else {
        var otherId = chat.participants.find(function(id) { return id !== currentUser.uid; });
        if (otherId) {
            try {
                var doc = await db.collection('users').doc(otherId).get();
                if (doc.exists) {
                    var data = doc.data();
                    name = data.name || data.username || 'Unknown';
                    initial = name.charAt(0).toUpperCase();
                }
            } catch (_) {}
        }
    }

    var timeStr = '';
    if (chat.lastMessageTime) {
        timeStr = formatTime(chat.lastMessageTime.toDate());
    }

    var preview = chat.lastMessage || '';
    if (chat.lastMessageSender === currentUser.uid && preview) {
        preview = 'You: ' + preview;
    }

    item.innerHTML =
        '<div class="chat-list-avatar">' + initial + '</div>' +
        '<div class="chat-list-info">' +
            '<div class="chat-list-name">' + escapeHtml(name) + '</div>' +
            '<div class="chat-list-preview">' + escapeHtml(preview) + '</div>' +
        '</div>' +
        '<div class="chat-list-time">' + timeStr + '</div>';
    return item;
}

/* ============================================
   Open/Close Chat
   ============================================ */
async function openChat(chatId) {
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }

    activeChatId = chatId;
    document.querySelectorAll('.chat-list-item').forEach(function(el) {
        el.classList.remove('active');
    });

    try {
        var doc = await db.collection('chats').doc(chatId).get();
        if (!doc.exists) return;
        activeChatData = doc.data();

        document.getElementById('no-chat').style.display = 'none';
        var chatActive = document.getElementById('chat-active');
        chatActive.style.display = 'flex';

        var headerName = document.getElementById('chat-header-name');
        var headerStatus = document.getElementById('chat-header-status');
        var addBtn = document.getElementById('btn-add-member');

        if (activeChatData.type === 'group') {
            headerName.textContent = activeChatData.name || 'Group';
            headerStatus.textContent = activeChatData.participants.length + ' members';
            headerStatus.className = 'status-text';
            addBtn.style.display = 'flex';
        } else {
            addBtn.style.display = 'none';
            var otherId = activeChatData.participants.find(function(id) { return id !== currentUser.uid; });
            if (otherId) {
                try {
                    var userDoc = await db.collection('users').doc(otherId).get();
                    if (userDoc.exists) {
                        var udata = userDoc.data();
                        headerName.textContent = udata.name || udata.username;
                    }
                } catch (_) {}
                listenForPresence(otherId, function(val) {
                    if (val && val.online) {
                        headerStatus.textContent = 'Online';
                        headerStatus.className = 'status-text online';
                    } else {
                        headerStatus.textContent = 'Offline';
                        headerStatus.className = 'status-text';
                    }
                });
            }
        }

        listenForMessages(chatId);
        listenForTyping(chatId);

        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.add('hidden');
        }
    } catch (err) {
        console.error('Open chat error:', err);
    }
}

function closeChat() {
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }
    activeChatId = null;
    activeChatData = null;
    document.getElementById('chat-active').style.display = 'none';
    document.getElementById('no-chat').style.display = 'flex';
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('typing-indicator').textContent = '';
}

/* ============================================
   Messages
   ============================================ */
function listenForMessages(chatId) {
    var container = document.getElementById('messages-container');
    messagesUnsubscribe = db.collection('chats').doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(function(snapshot) {
            container.innerHTML = '';
            snapshot.forEach(function(doc) {
                var msg = doc.data();
                var deletedFor = msg.deletedFor || [];
                if (deletedFor.indexOf(currentUser.uid) === -1) {
                    var el = renderMessage(doc.id, msg);
                    container.appendChild(el);
                }
            });
            container.scrollTop = container.scrollHeight;
        }, function(err) {
            console.error('Messages error:', err);
        });
}

function renderMessage(msgId, msg) {
    var isSent = msg.senderId === currentUser.uid;
    var wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + (isSent ? 'sent' : 'received');

    var html = '';

    if (activeChatData && activeChatData.type === 'group' && !isSent) {
        html += '<div class="message-sender-name">' + escapeHtml(msg.senderName || 'Unknown') + '</div>';
    }

    html += '<div class="message-bubble">' + escapeHtml(msg.text) + '</div>';

    if (isSent) {
        html += '<div class="message-actions">' +
            '<button class="msg-action-btn" onclick="showEditMessage(\'' + msgId + '\', \'' + escapeAttr(msg.text) + '\')" title="Edit">&#9998;</button>' +
            '<button class="msg-action-btn" onclick="deleteMessage(\'' + msgId + '\')" title="Delete">&#10005;</button>' +
            '</div>';
    }

    html += '<div class="message-meta">';
    if (msg.timestamp) {
        html += '<span class="message-time">' + formatMessageTime(msg.timestamp) + '</span>';
    }
    if (msg.edited) {
        html += '<span class="message-edited">edited</span>';
    }
    html += '</div>';

    wrapper.innerHTML = html;
    return wrapper;
}

async function sendMessage() {
    var input = document.getElementById('message-input');
    var text = input.value.trim();
    if (!text || !activeChatId) return;

    input.value = '';

    try {
        await db.collection('chats').doc(activeChatId)
            .collection('messages').add({
                senderId: currentUser.uid,
                senderName: currentUserData.name || currentUserData.username,
                text: text,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                edited: false,
                deletedFor: []
            });

        await db.collection('chats').doc(activeChatId).update({
            lastMessage: text,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessageSender: currentUser.uid
        });

        clearTypingStatus();
    } catch (err) {
        console.error('Send message error:', err);
        input.value = text;
    }
}

function handleMessageKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleTyping() {
    if (!activeChatId || !currentUser) return;
    rtdb.ref('typing/' + currentUser.uid).set({
        chatId: activeChatId,
        name: currentUserData.name || currentUserData.username,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(clearTypingStatus, 3000);
}

function clearTypingStatus() {
    if (currentUser) {
        rtdb.ref('typing/' + currentUser.uid).remove();
    }
}

function listenForTyping(chatId) {
    rtdb.ref('typing').on('value', function(snap) {
        var indicator = document.getElementById('typing-indicator');
        if (!snap.exists()) {
            indicator.textContent = '';
            return;
        }
        var names = [];
        snap.forEach(function(child) {
            var val = child.val();
            if (val.chatId === chatId && child.key !== currentUser.uid) {
                names.push(val.name);
            }
        });
        if (names.length > 0) {
            indicator.textContent = names.join(', ') + (names.length === 1 ? ' is' : ' are') + ' typing...';
        } else {
            indicator.textContent = '';
        }
    });
}

/* ============================================
   Edit & Delete Messages
   ============================================ */
function showEditMessage(msgId, text) {
    editMessageId = msgId;
    document.getElementById('edit-message-input').value = text;
    document.getElementById('edit-modal').style.display = 'flex';
    document.getElementById('edit-message-input').focus();
}

function closeEditModal() {
    editMessageId = null;
    document.getElementById('edit-modal').style.display = 'none';
}

async function saveEditedMessage() {
    var text = document.getElementById('edit-message-input').value.trim();
    if (!text || !editMessageId || !activeChatId) return;
    try {
        await db.collection('chats').doc(activeChatId)
            .collection('messages').doc(editMessageId).update({
                text: text,
                edited: true,
                editedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        closeEditModal();
    } catch (err) {
        console.error('Edit error:', err);
    }
}

async function deleteMessage(msgId) {
    if (!activeChatId) return;
    if (!confirm('Delete this message?')) return;
    try {
        await db.collection('chats').doc(activeChatId)
            .collection('messages').doc(msgId).update({
                deletedFor: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
    } catch (err) {
        console.error('Delete error:', err);
    }
}

/* ============================================
   User Search
   ============================================ */
function searchUsers(query) {
    clearTimeout(searchTimeout);
    var resultsEl = document.getElementById('search-results');
    if (!query || query.length < 2) {
        resultsEl.classList.remove('active');
        resultsEl.innerHTML = '';
        return;
    }
    searchTimeout = setTimeout(async function() {
        var q = query.trim().toLowerCase();
        var results = [];
        try {
            var emailQuery = await db.collection('users')
                .where('email', '==', q)
                .limit(5)
                .get();
            emailQuery.forEach(function(doc) {
                if (doc.id !== currentUser.uid) {
                    results.push({ id: doc.id, ...doc.data() });
                }
            });

            var usernameQuery = await db.collection('users')
                .where('username', '==', q)
                .limit(5)
                .get();
            usernameQuery.forEach(function(doc) {
                if (doc.id !== currentUser.uid && !results.find(function(r) { return r.id === doc.id; })) {
                    results.push({ id: doc.id, ...doc.data() });
                }
            });
        } catch (err) {
            console.error('Search error:', err);
        }
        renderSearchResults(results, resultsEl, 'startChat');
    }, 350);
}

function renderSearchResults(results, container, actionFn) {
    container.innerHTML = '';
    if (results.length === 0) {
        container.innerHTML = '<div class="search-no-results">No users found</div>';
    } else {
        results.forEach(function(user) {
            var item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML =
                '<div class="search-result-avatar">' + (user.name || user.username || '?').charAt(0).toUpperCase() + '</div>' +
                '<div class="search-result-info">' +
                    '<div class="search-result-name">' + escapeHtml(user.name || 'Unknown') + '</div>' +
                    '<div class="search-result-username">@' + escapeHtml(user.username || '') + '</div>' +
                '</div>';
            item.onclick = function() {
                if (actionFn === 'startChat') {
                    startChat(user.id);
                } else if (actionFn === 'addGroupMember') {
                    addGroupMember(user);
                } else if (actionFn === 'addToGroup') {
                    addMemberToGroup(user.id);
                }
            };
            container.appendChild(item);
        });
    }
    container.classList.add('active');
}

function clearSearch() {
    var el = document.getElementById('search-results');
    el.classList.remove('active');
    el.innerHTML = '';
}

/* ============================================
   New Chat Modal
   ============================================ */
function showNewChatModal() {
    document.getElementById('user-search').value = '';
    document.getElementById('user-search').focus();
    clearSearch();
}

/* ============================================
   Group Chat
   ============================================ */
function showNewGroupModal() {
    groupSelectedMembers = [];
    document.getElementById('group-name-input').value = '';
    document.getElementById('group-member-search').value = '';
    document.getElementById('group-search-results').innerHTML = '';
    document.getElementById('group-search-results').classList.remove('active');
    document.getElementById('group-selected-members').innerHTML = '';
    document.getElementById('group-modal').style.display = 'flex';
}

function closeGroupModal() {
    document.getElementById('group-modal').style.display = 'none';
    groupSelectedMembers = [];
}

function searchGroupMembers(query) {
    clearTimeout(searchTimeout);
    var resultsEl = document.getElementById('group-search-results');
    if (!query || query.length < 2) {
        resultsEl.classList.remove('active');
        resultsEl.innerHTML = '';
        return;
    }
    searchTimeout = setTimeout(async function() {
        var q = query.trim().toLowerCase();
        var results = [];
        try {
            var emailQuery = await db.collection('users')
                .where('email', '==', q)
                .limit(5).get();
            emailQuery.forEach(function(doc) {
                if (doc.id !== currentUser.uid && !groupSelectedMembers.find(function(m) { return m.id === doc.id; })) {
                    results.push({ id: doc.id, ...doc.data() });
                }
            });
            var usernameQuery = await db.collection('users')
                .where('username', '==', q)
                .limit(5).get();
            usernameQuery.forEach(function(doc) {
                if (doc.id !== currentUser.uid && !results.find(function(r) { return r.id === doc.id; }) && !groupSelectedMembers.find(function(m) { return m.id === doc.id; })) {
                    results.push({ id: doc.id, ...doc.data() });
                }
            });
        } catch (err) {
            console.error('Group search error:', err);
        }
        renderSearchResults(results, resultsEl, 'addGroupMember');
    }, 350);
}

function addGroupMember(user) {
    if (groupSelectedMembers.find(function(m) { return m.id === user.id; })) return;
    groupSelectedMembers.push(user);
    document.getElementById('group-member-search').value = '';
    document.getElementById('group-search-results').classList.remove('active');
    document.getElementById('group-search-results').innerHTML = '';
    renderSelectedMembers();
}

function removeGroupMember(userId) {
    groupSelectedMembers = groupSelectedMembers.filter(function(m) { return m.id !== userId; });
    renderSelectedMembers();
}

function renderSelectedMembers() {
    var container = document.getElementById('group-selected-members');
    container.innerHTML = '';
    groupSelectedMembers.forEach(function(m) {
        var el = document.createElement('div');
        el.className = 'selected-member';
        el.innerHTML = escapeHtml(m.name || m.username) +
            ' <button class="remove-member" onclick="removeGroupMember(\'' + m.id + '\')">&times;</button>';
        container.appendChild(el);
    });
}

async function createGroup() {
    var name = document.getElementById('group-name-input').value.trim();
    if (!name) {
        alert('Please enter a group name.');
        return;
    }
    if (groupSelectedMembers.length < 1) {
        alert('Please add at least one member.');
        return;
    }
    var participantIds = [currentUser.uid];
    groupSelectedMembers.forEach(function(m) { participantIds.push(m.id); });
    try {
        await db.collection('chats').add({
            participants: participantIds,
            type: 'group',
            name: name,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessage: '',
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeGroupModal();
        loadChatList();
    } catch (err) {
        console.error('Create group error:', err);
    }
}

/* ============================================
   Add Member to Existing Group
   ============================================ */
function showAddMemberModal() {
    if (!activeChatData || activeChatData.type !== 'group') return;
    document.getElementById('add-member-search').value = '';
    document.getElementById('add-member-search-results').innerHTML = '';
    document.getElementById('add-member-search-results').classList.remove('active');
    document.getElementById('add-member-modal').style.display = 'flex';
}

function closeAddMemberModal() {
    document.getElementById('add-member-modal').style.display = 'none';
}

function searchAddMembers(query) {
    clearTimeout(searchTimeout);
    var resultsEl = document.getElementById('add-member-search-results');
    if (!query || query.length < 2) {
        resultsEl.classList.remove('active');
        resultsEl.innerHTML = '';
        return;
    }
    searchTimeout = setTimeout(async function() {
        var q = query.trim().toLowerCase();
        var results = [];
        var existingParticipants = activeChatData ? activeChatData.participants : [];
        try {
            var emailQuery = await db.collection('users')
                .where('email', '==', q)
                .limit(5).get();
            emailQuery.forEach(function(doc) {
                if (existingParticipants.indexOf(doc.id) === -1) {
                    results.push({ id: doc.id, ...doc.data() });
                }
            });
            var usernameQuery = await db.collection('users')
                .where('username', '==', q)
                .limit(5).get();
            usernameQuery.forEach(function(doc) {
                if (existingParticipants.indexOf(doc.id) === -1 && !results.find(function(r) { return r.id === doc.id; })) {
                    results.push({ id: doc.id, ...doc.data() });
                }
            });
        } catch (err) {
            console.error('Add member search error:', err);
        }
        renderSearchResults(results, resultsEl, 'addToGroup');
    }, 350);
}

async function addMemberToGroup(userId) {
    if (!activeChatId) return;
    try {
        await db.collection('chats').doc(activeChatId).update({
            participants: firebase.firestore.FieldValue.arrayUnion(userId)
        });
        activeChatData.participants.push(userId);
        closeAddMemberModal();
        var headerStatus = document.getElementById('chat-header-status');
        headerStatus.textContent = activeChatData.participants.length + ' members';
    } catch (err) {
        console.error('Add member error:', err);
    }
}

/* ============================================
   Helpers
   ============================================ */
function formatTime(date) {
    var now = new Date();
    var diff = now - date;
    var dayMs = 86400000;
    if (diff < dayMs && now.getDate() === date.getDate()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 7 * dayMs) {
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    var date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function cleanupListeners() {
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }
    rtdb.ref('typing').off();
}

/* ============================================
   Keyboard: ESC to close modals
   ============================================ */
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeEditModal();
        closeGroupModal();
        closeAddMemberModal();
    }
});
