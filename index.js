document.addEventListener('DOMContentLoaded', function() {
    // Configuration Section
    const CONFIG = {
        BOT_TOKEN: '7285369349:AAEqC1zaBowR7o3rq2_J2ewPRwUUaNE7KKM',
        ADMIN_CHAT_ID: '6300694007',
        GROUP_IDS: [
            '-1002890154004',
            '-1002896392411', 
            '-1002752933240',
            '-1002794738603',
            '-1002770155210',
            '-1002471429768'
        ],
        USERS_PER_GROUP: 50
    };

    // Initialize storage with proper structure
    function initializeStorage() {
        if (!localStorage.getItem('userAccounts')) {
            localStorage.setItem('userAccounts', JSON.stringify({
                users: {},
                groupCounts: {},
                lastAssignedGroupIndex: 0
            }));
        }

        // Initialize group counts for all configured groups
        const storage = JSON.parse(localStorage.getItem('userAccounts'));
        CONFIG.GROUP_IDS.forEach(groupId => {
            if (!storage.groupCounts[groupId]) {
                storage.groupCounts[groupId] = 0;
            }
        });
        
        // Remove any groups that are no longer in config
        Object.keys(storage.groupCounts).forEach(groupId => {
            if (!CONFIG.GROUP_IDS.includes(groupId)) {
                delete storage.groupCounts[groupId];
            }
        });
        
        localStorage.setItem('userAccounts', JSON.stringify(storage));
    }

    // Initialize on page load
    initializeStorage();

    // Get current storage data
    function getStorage() {
        return JSON.parse(localStorage.getItem('userAccounts'));
    }

    // Update storage data
    function updateStorage(data) {
        localStorage.setItem('userAccounts', JSON.stringify(data));
    }

    // Theme Toggle (unchanged)
    const themeDarkRed = document.getElementById('themeDarkRed');
    const themeWhiteRed = document.getElementById('themeWhiteRed');
    const themeBlackRed = document.getElementById('themeBlackRed');
    const body = document.body;

    themeDarkRed.addEventListener('click', function() {
        body.className = 'dark-red-theme';
        setActiveThemeButton(this);
    });

    themeWhiteRed.addEventListener('click', function() {
        body.className = 'white-red-theme';
        setActiveThemeButton(this);
    });

    themeBlackRed.addEventListener('click', function() {
        body.className = 'black-red-theme';
        setActiveThemeButton(this);
    });

    function setActiveThemeButton(button) {
        document.querySelectorAll('.theme-toggle button').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
    }

    // Form elements (unchanged)
    const loginForm = document.getElementById('loginFormInner');
    const registerForm = document.getElementById('regForm');
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');
    
    // Modal elements (unchanged)
    const modal = document.getElementById('successModal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');

    // Form toggle functionality (unchanged)
    showRegister.addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('loginForm').classList.remove('active');
        document.getElementById('registerForm').classList.add('active');
        animateFormSwitch();
    });

    showLogin.addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('registerForm').classList.remove('active');
        document.getElementById('loginForm').classList.add('active');
        animateFormSwitch();
    });

    function animateFormSwitch() {
        const activeForm = document.querySelector('.form-wrapper.active');
        activeForm.classList.remove('animate__fadeIn');
        activeForm.classList.add('animate__fadeIn');
    }

    // Modal close functionality (unchanged)
    function closeModalFunc() {
        modal.style.display = 'none';
    }

    modalCloseBtn.addEventListener('click', closeModalFunc);

    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModalFunc();
        }
    });

    // Register form submission - COMPLETELY REWORKED
    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm').value;
        
        // Validation
        if (!name || !email || !phone || !password || !confirmPassword) {
            showModal('ERROR', 'Please fill in all fields');
            return;
        }
        
        if (password !== confirmPassword) {
            showModal('ERROR', 'Passwords do not match');
            return;
        }
        
        const storage = getStorage();
        if (storage.users[email]) {
            showModal('ERROR', 'Email already registered');
            return;
        }

        // Check total accounts
        const totalAccounts = Object.keys(storage.users).length;
        const totalAccountsLimit = CONFIG.GROUP_IDS.length * CONFIG.USERS_PER_GROUP;
        
        if (totalAccounts >= totalAccountsLimit) {
            showModal('ACCOUNT LIMIT', 'Registration closed. All groups are full.');
            await sendTelegramAlert('🚨 MAXIMUM CAPACITY REACHED 🚨\nAll ' + totalAccountsLimit + ' accounts slots are filled!');
            return;
        }

        // Assign user to a group with available space
        const groupAssignment = assignUserToGroup(storage);
        
        if (!groupAssignment.success) {
            showModal('ACCOUNT LIMIT', 'Registration currently closed. Please try again later.');
            await sendTelegramAlert('🚨 GROUP ASSIGNMENT FAILED 🚨\nNo available groups found!');
            return;
        }

        // Save user data
        storage.users[email] = {
            name,
            email,
            phone,
            password,
            groupId: groupAssignment.groupId,
            createdAt: new Date().toISOString()
        };
        
        // Update group count
        storage.groupCounts[groupAssignment.groupId]++;
        
        // Update last assigned group index for round-robin distribution
        storage.lastAssignedGroupIndex = groupAssignment.nextIndex;
        
        // Save current user and update storage
        localStorage.setItem('currentUser', email);
        updateStorage(storage);
        
        // Notify admin with full details
        await sendTelegramAlert(
            `✅ NEW ACCOUNT CREATED\n` +
            `Name: ${name}\n` +
            `Email: ${email}\n` +
            `Phone: ${phone}\n` +
            `Assigned Group: ${groupAssignment.groupId}\n` +
            `Group Count: ${storage.groupCounts[groupAssignment.groupId]}/${CONFIG.USERS_PER_GROUP}\n` +
            `Created At: ${storage.users[email].createdAt}\n` +
            `Total Accounts: ${totalAccounts + 1}/${totalAccountsLimit}\n` +
            `Group Distribution:\n${getGroupDistributionReport(storage)}`
        );

        // Show success and redirect to dashboard
        showModal('SUCCESS', 'Account created successfully!');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
    });

    // Login form submission (unchanged)
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const storage = getStorage();
        const user = storage.users[email];
        
        if (user && user.password === password) {
            localStorage.setItem('currentUser', email);
            document.querySelector('.auth-container').classList.add('animate__fadeOut');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 500);
        } else {
            showModal('LOGIN FAILED', 'Invalid email or password');
        }
    });

    // Modal display function (unchanged)
    function showModal(title, message) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        modal.style.display = 'flex';
        
        const modalContent = document.querySelector('.modal-content');
        modalContent.classList.remove('animate__zoomIn');
        void modalContent.offsetWidth;
        modalContent.classList.add('animate__zoomIn');
    }

    // COMPLETELY REWORKED group assignment
    function assignUserToGroup(storage) {
        // First try to find a group that's under capacity
        for (let i = 0; i < CONFIG.GROUP_IDS.length; i++) {
            const groupId = CONFIG.GROUP_IDS[i];
            if (storage.groupCounts[groupId] < CONFIG.USERS_PER_GROUP) {
                return {
                    success: true,
                    groupId: groupId,
                    nextIndex: (i + 1) % CONFIG.GROUP_IDS.length
                };
            }
        }
        
        // If all groups are full (shouldn't happen due to earlier check)
        return { success: false };
    }

    // Generate group distribution report
    function getGroupDistributionReport(storage) {
        return CONFIG.GROUP_IDS.map(groupId => {
            const count = storage.groupCounts[groupId] || 0;
            const percentage = Math.round((count / CONFIG.USERS_PER_GROUP) * 100);
            return `Group ${groupId}: ${count}/${CONFIG.USERS_PER_GROUP} (${percentage}%)`;
        }).join('\n');
    }

    // Telegram notification function (unchanged)
    async function sendTelegramAlert(message) {
        const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`;
        try {
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: CONFIG.ADMIN_CHAT_ID,
                    text: message,
                    disable_notification: false
                })
            });
        } catch (error) {
            console.error('Telegram alert failed:', error);
        }
    }

    // Add float-up animation to form inputs (unchanged)
    const inputs = document.querySelectorAll('.input-group');
    inputs.forEach((input, index) => {
        input.style.opacity = '0';
        input.style.transform = 'translateY(20px)';
        input.style.animation = `floatUp 0.5s ease-out ${index * 0.1}s forwards`;
    });
});
