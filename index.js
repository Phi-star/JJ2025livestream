document.addEventListener('DOMContentLoaded', function() {
    // Configuration Section (Edit here to add groups or change limits)
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
            // Add new group IDs here, e.g., '-1001234567890',
        ],
        USERS_PER_GROUP: 50 // Number of accounts per group
    };

    // Initialize or update group counters
    function initializeGroupCounters() {
        CONFIG.GROUP_IDS.forEach(groupId => {
            if (!localStorage.getItem(`group_${groupId}_count`)) {
                localStorage.setItem(`group_${groupId}_count`, '0');
            }
        });
        
        // Clean up old groups that are no longer in config
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('group_') && key.endsWith('_count')) {
                const groupId = key.replace('group_', '').replace('_count', '');
                if (!CONFIG.GROUP_IDS.includes(groupId)) {
                    localStorage.removeItem(key);
                }
            }
        });
    }

    // Initialize users tracking if not exists
    if (!localStorage.getItem('users')) {
        localStorage.setItem('users', JSON.stringify([]));
    }

    // Initialize group counters
    initializeGroupCounters();

    // Theme Toggle
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

    // Form elements
    const loginForm = document.getElementById('loginFormInner');
    const registerForm = document.getElementById('regForm');
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');
    
    // Modal elements
    const modal = document.getElementById('successModal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');

    // Form toggle functionality
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

    // Modal close functionality
    function closeModalFunc() {
        modal.style.display = 'none';
    }

    modalCloseBtn.addEventListener('click', closeModalFunc);

    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModalFunc();
        }
    });

    // Register form submission
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
        
        if (localStorage.getItem(email)) {
            showModal('ERROR', 'Email already registered');
            return;
        }

        // Check total accounts
        const users = JSON.parse(localStorage.getItem('users'));
        const totalAccountsLimit = CONFIG.GROUP_IDS.length * CONFIG.USERS_PER_GROUP;
        
        if (users.length >= totalAccountsLimit) {
            showModal('ACCOUNT LIMIT', 'Registration closed.');
            await sendTelegramAlert('🚨 MAXIMUM CAPACITY REACHED 🚨\nAll ' + totalAccountsLimit + ' accounts slots are filled!');
            return;
        }

        // Assign user to a group with available space
        const groupAssignment = await assignUserToGroup();
        
        if (!groupAssignment.success) {
            showModal('ACCOUNT LIMIT', 'Registration currently closed. Please try again later.');
            await sendTelegramAlert('🚨 GROUP ASSIGNMENT FAILED 🚨\nNo available groups found!');
            return;
        }

        // Save user data
        const user = {
            name,
            email,
            phone,
            password,
            groupId: groupAssignment.groupId,
            createdAt: new Date().toISOString()
        };
        
        localStorage.setItem(email, JSON.stringify(user));
        localStorage.setItem('currentUser', email);
        
        // Update users list
        users.push(email);
        localStorage.setItem('users', JSON.stringify(users));
        
        // Update group counter
        const groupCount = parseInt(localStorage.getItem(`group_${groupAssignment.groupId}_count`)) + 1;
        localStorage.setItem(`group_${groupAssignment.groupId}_count`, groupCount.toString());

        // Notify admin with full details
        await sendTelegramAlert(
            `✅ NEW ACCOUNT CREATED\n` +
            `Name: ${name}\n` +
            `Email: ${email}\n` +
            `Phone: ${phone}\n` +
            `Assigned Group: ${groupAssignment.groupId}\n` +
            `Group Count: ${groupCount}/${CONFIG.USERS_PER_GROUP}\n` +
            `Created At: ${user.createdAt}\n` +
            `Total Accounts: ${users.length}/${totalAccountsLimit}\n` +
            `Group Distribution:\n${getGroupDistributionReport()}`
        );

        // Show success and redirect to dashboard
        showModal('SUCCESS', 'Account created successfully!');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
    });

    // Login form submission
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const user = JSON.parse(localStorage.getItem(email));
        
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

    // Modal display function
    function showModal(title, message) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        modal.style.display = 'flex';
        
        const modalContent = document.querySelector('.modal-content');
        modalContent.classList.remove('animate__zoomIn');
        void modalContent.offsetWidth;
        modalContent.classList.add('animate__zoomIn');
    }

    // Helper function to assign user to a group with available space
    async function assignUserToGroup() {
        // Reinitialize counters in case new groups were added
        initializeGroupCounters();
        
        // Get all groups sorted by current count (ascending)
        const sortedGroups = CONFIG.GROUP_IDS.map(groupId => {
            return {
                id: groupId,
                count: parseInt(localStorage.getItem(`group_${groupId}_count`)) || 0
            };
        }).sort((a, b) => a.count - b.count);
        
        // Find first group with available space
        const availableGroup = sortedGroups.find(group => group.count < CONFIG.USERS_PER_GROUP);
        
        if (!availableGroup) {
            return { success: false };
        }
        
        return { success: true, groupId: availableGroup.id };
    }

    // Function to generate group distribution report
    function getGroupDistributionReport() {
        return CONFIG.GROUP_IDS.map(groupId => {
            const count = parseInt(localStorage.getItem(`group_${groupId}_count`)) || 0;
            return `Group ${groupId}: ${count}/${CONFIG.USERS_PER_GROUP}`;
        }).join('\n');
    }

    // Function to send Telegram notification
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

    // Add float-up animation to form inputs
    const inputs = document.querySelectorAll('.input-group');
    inputs.forEach((input, index) => {
        input.style.opacity = '0';
        input.style.transform = 'translateY(20px)';
        input.style.animation = `floatUp 0.5s ease-out ${index * 0.1}s forwards`;
    });
});