const axios = require('axios');
const ethers = require('ethers');
const fs = require('fs');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const { HttpsProxyAgent } = require('https-proxy-agent');

const BASE_URL = 'https://quest-api.gpu.net';
const WALLET_FILE = 'wallets.json';
const PROXY_FILE = 'proxies.txt';
const REFERRAL_CODE_FILE = 'code.txt';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  cyan: '\x1b[36m'
};

const defaultHeaders = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'priority': 'u=1, i',
  'sec-ch-ua': '"Brave";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'sec-gpc': '1',
  'Referer': 'https://token.gpu.net/',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms + Math.random() * 1000));

const log = {
  info: (message) => console.log(`${colors.cyan}ℹ️ ${message}${colors.reset}`),
  success: (message) => console.log(`${colors.green}✅ ${message}${colors.reset}`),
  warning: (message) => console.log(`${colors.yellow}⚠️ ${message}${colors.reset}`),
  error: (message) => console.log(`${colors.red}❌ ${message}${colors.reset}`),
  task: (message) => console.log(`${colors.white}📋 ${message}${colors.reset}`),
  wallet: (message) => console.log(`${colors.white}💼 ${message}${colors.reset}`),
  divider: () => console.log(`\n${colors.dim}===================================${colors.reset}`)
};

const getReferralCode = () => {
  try {
    if (fs.existsSync(REFERRAL_CODE_FILE)) {
      const code = fs.readFileSync(REFERRAL_CODE_FILE, 'utf-8').trim();
      if (code) {
        log.info(`Using referral code: ${code}`);
        return code;
      }
    }
    return '';
  } catch (error) {
    log.error(`Error reading referral code: ${error.message}`);
    return '';
  }
};

const loadProxies = () => {
  try {
    if (!fs.existsSync(PROXY_FILE)) {
      log.warning('proxies.txt not found, running without proxies');
      return [];
    }
    const proxies = fs.readFileSync(PROXY_FILE, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    log.info(`Loaded ${proxies.length} proxies from ${PROXY_FILE}`);
    return proxies;
  } catch (error) {
    log.error(`Error loading proxies: ${error.message}`);
    return [];
  }
};

const loadExistingWallets = () => {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      const data = fs.readFileSync(WALLET_FILE, 'utf-8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    log.error(`Error loading existing wallets: ${error.message}`);
    return [];
  }
};

const getRandomProxy = (proxies) => {
  if (!proxies.length) return null;
  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
};

const generateWallet = () => {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase,
    tasksCompleted: [],
    gxpEarned: 0,
    createdAt: new Date().toISOString()
  };
};

const saveWallets = (wallets) => {
  log.info(`Saving ${wallets.length} wallets to ${WALLET_FILE}`);
  fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2));
};

const registerWallet = async (wallet, proxy, referralCode, retryCount = 3) => {
  let attempt = 0;
  while (attempt < retryCount) {
    try {
      log.wallet(`Registering wallet: ${wallet.address} (Attempt ${attempt + 1}/${retryCount})`);

      const axiosConfig = {
        baseURL: BASE_URL,
        headers: defaultHeaders,
        timeout: 30000
      };
      
      if (proxy) {
        log.info(`Using proxy: ${proxy}`);
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxy);
      }
      
      const api = axios.create(axiosConfig);

      let nonce;
      let cookies = '';
      let nonceAttempt = 0;
      const nonceRetryCount = 3;
      
      while (nonceAttempt < nonceRetryCount) {
        try {
          log.info(`Fetching nonce (Attempt ${nonceAttempt + 1}/${nonceRetryCount})...`);
          const nonceResponse = await api.get('/api/auth/eth/nonce');
          
          nonce = typeof nonceResponse.data === 'string' 
            ? nonceResponse.data.trim() 
            : nonceResponse.data.nonce;
            
          if (!nonce) throw new Error(`No nonce found in response: ${JSON.stringify(nonceResponse.data)}`);

          cookies = nonceResponse.headers['set-cookie']?.join('; ') || '';
          log.success(`Nonce retrieved successfully`);
          break;
        } catch (nonceError) {
          nonceAttempt++;
          log.error(`Failed to fetch nonce: ${nonceError.message}`);
          
          if (nonceAttempt < nonceRetryCount) {
            log.info(`Retrying nonce fetch after random delay...`);
            await delay(3000);
          } else {
            throw new Error(`Max nonce retries reached: ${nonceError.message}`);
          }
        }
      }

      if (cookies) api.defaults.headers['cookie'] = cookies;

      const issuedAt = new Date().toISOString();
      const message = `token.gpu.net wants you to sign in with your Ethereum account:\n${wallet.address}\n\nSign in with Ethereum to the app.\n\nURI: https://token.gpu.net\nVersion: 1\nChain ID: 4048\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

      const ethWallet = new ethers.Wallet(wallet.privateKey);
      const signature = await ethWallet.signMessage(message);

      log.info(`Sending verification request for wallet: ${wallet.address}`);
      const verifyResponse = await api.post('/api/auth/eth/verify', {
        message,
        signature,
        referralCode: referralCode
      }, {
        headers: { 'content-type': 'application/json' }
      });

      const sessionCookies = verifyResponse.headers['set-cookie']?.join('; ') || cookies;
      api.defaults.headers['cookie'] = sessionCookies;
      
      log.success(`Wallet ${wallet.address} registered successfully`);
      return { api, wallet, cookies: sessionCookies };
    } catch (error) {
      attempt++;
      log.error(`Failed to register wallet ${wallet.address}: ${error.message}`);
      
      if (error.response) {
        log.error(`Server response: ${JSON.stringify(error.response.data)}`);
        log.error(`Server status: ${error.response.status}`);
      }
      
      if (attempt < retryCount) {
        log.info(`Retrying after delay...`);
        await delay(5000);
      } else {
        log.error(`Max retries reached for ${wallet.address}`);
        return null;
      }
    }
  }
};

const getUserInfo = async (api) => {
  try {
    const response = await api.get('/api/users/me');
    log.info('User Info retrieved successfully');
    return response.data;
  } catch (error) {
    log.error('Error fetching user info: ' + error.message);
    return null;
  }
};

const getUserStreak = async (api) => {
  try {
    const response = await api.get('/api/users/streak');
    log.info(`Streak Info: ${response.data.current} days (Max: ${response.data.maximum})`);
    return response.data;
  } catch (error) {
    log.error('Error fetching streak info: ' + error.message);
    return null;
  }
};

const completeTasks = async (api, category, wallet) => {
  try {
    log.task(`Processing ${category} Tasks...`);
    const response = await api.get(`/api/users/${category}/tasks`);
    const tasks = response.data;
    
    for (const task of tasks) {
      if (task.completed) {
        log.info(`Task "${task.name}" already completed`);
        continue;
      }
      
      log.task(`Attempting: ${task.name} (${task.experience} GXP)`);
      
      try {
        await api.post(`/api/users/${category}/tasks/${task.id}/verify`);
        log.success(`${task.name}: Completed (+${task.experience} GXP)`);
        wallet.tasksCompleted.push({ 
          category, 
          taskId: task.id, 
          name: task.name, 
          gxp: task.experience,
          completedAt: new Date().toISOString()
        });
      } catch (postError) {
        try {
          await api.get(`/api/users/${category}/tasks/${task.id}/verify`);
          log.success(`${task.name}: Completed (+${task.experience} GXP)`);
          wallet.tasksCompleted.push({ 
            category, 
            taskId: task.id, 
            name: task.name, 
            gxp: task.experience,
            completedAt: new Date().toISOString()
          });
        } catch (getError) {
          log.error(`${task.name}: Failed - ${getError.response?.data?.message || getError.message}`);
        }
      }

      await delay(1500);
    }
    return tasks;
  } catch (error) {
    log.error(`Error processing ${category} tasks: ${error.message}`);
    return [];
  }
};

const showStats = (wallets) => {
  log.divider();
  log.info(`📊 STATISTICS 📊`);
  
  const totalGXP = wallets.reduce((sum, w) => sum + (w.gxpEarned || 0), 0);
  const completedTasks = wallets.reduce((sum, w) => sum + (w.tasksCompleted?.length || 0), 0);
  
  console.log(`${colors.bright}Total Wallets: ${colors.green}${wallets.length}${colors.reset}`);
  console.log(`${colors.bright}Total GXP Earned: ${colors.green}${totalGXP.toFixed(2)}${colors.reset}`);
  console.log(`${colors.bright}Total Tasks Completed: ${colors.green}${completedTasks}${colors.reset}`);
  console.log(`${colors.bright}Average GXP per Wallet: ${colors.green}${(totalGXP / wallets.length).toFixed(2)}${colors.reset}`);
  log.divider();
};

const runBot = async () => {
  log.divider();
  log.info('Token GPU Reff - Airdrop Insiders');
  log.divider();
  
  const proxies = loadProxies();
  const existingWallets = loadExistingWallets();
  const referralCode = getReferralCode();
  
  readline.question('Enter number of new wallets to create (0 to use existing only): ', async (count) => {
    const numWallets = parseInt(count);
    
    if (isNaN(numWallets)) {
      log.error('Invalid number of wallets');
      readline.close();
      return;
    }

    const wallets = [...existingWallets];
    
    if (numWallets > 0) {
      log.info(`Generating ${numWallets} new wallets...`);
      for (let i = 0; i < numWallets; i++) {
        wallets.push(generateWallet());
      }
      saveWallets(wallets);
    } else {
      log.info(`Using ${existingWallets.length} existing wallets`);
    }
    
    readline.question('Start processing wallets? (y/n): ', async (answer) => {
      if (answer.toLowerCase() !== 'y') {
        log.info('Operation cancelled by user');
        readline.close();
        return;
      }
      
      log.info(`Processing ${wallets.length} wallets...`);
      
      for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        log.divider();
        log.wallet(`Processing wallet ${i+1}/${wallets.length}: ${wallet.address}`);
        
        const proxy = getRandomProxy(proxies);
        const registration = await registerWallet(wallet, proxy, referralCode);
        
        if (!registration) {
          log.warning(`Skipping wallet ${wallet.address} due to registration failure`);
          saveWallets(wallets);
          continue;
        }
        
        const { api } = registration;
        
        const initialUserInfo = await getUserInfo(api);
        if (!initialUserInfo) {
          log.warning(`Skipping wallet ${wallet.address} due to user info failure`);
          saveWallets(wallets);
          continue;
        }
        
        await getUserStreak(api);

        await completeTasks(api, 'social', wallet);
        await completeTasks(api, 'gpunet', wallet);
        await completeTasks(api, 'onchain', wallet);
        await completeTasks(api, 'dev', wallet);

        const updatedUserInfo = await getUserInfo(api);
        if (updatedUserInfo && initialUserInfo) {
          const gxpEarned = parseFloat(updatedUserInfo.gxp) - parseFloat(initialUserInfo.gxp);
          log.success(`GXP Earned: ${gxpEarned.toFixed(2)}`);
          wallet.gxpEarned = gxpEarned;
          wallet.lastUpdated = new Date().toISOString();
        }
        
        saveWallets(wallets);

        const delaySeconds = 5 + Math.floor(Math.random() * 10);
        log.info(`Waiting ${delaySeconds} seconds before next wallet...`);
        await delay(delaySeconds * 1000);
      }
      
      showStats(wallets);
      log.success('🏁 Bot execution completed!');
      readline.close();
    });
  });
};

process.on('unhandledRejection', (error) => {
  log.error(`Unhandled promise rejection: ${error.message}`);
  log.error(error.stack);
});

runBot().catch(error => {
  log.error('Bot execution failed:');
  log.error(error.stack || error.message);
});