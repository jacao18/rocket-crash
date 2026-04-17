// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RocketCrash v2 — Stateless payment vault
 *
 * The game logic runs entirely on the frontend.
 * The contract is a simple vault that:
 *   - Accepts bets via placeBet()
 *   - Pays out wins via payout() called by the owner (house)
 *   - Never stores round state → no "round already active" bugs
 *
 * Trust model: owner is the house. For production, replace with
 * a commit-reveal or VRF scheme. This is a testnet demo.
 */
contract RocketCrash {
    address public owner;

    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 0.010 ether;
    uint256 public constant MAX_MULT_X100 = 1000; // 10.00x

    event BetPlaced(address indexed player, uint256 amount);
    event Payout(address indexed player, uint256 betAmount, uint256 multX100, uint256 payout);
    event Crashed(address indexed player, uint256 betAmount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() payable {
        owner = msg.sender;
    }

    receive() external payable {}

    // ── Player places a bet — ETH goes straight into the vault
    function placeBet() external payable {
        require(msg.value >= MIN_BET && msg.value <= MAX_BET, "Bet out of range");
        require(address(this).balance >= msg.value * MAX_MULT_X100 / 100, "Insufficient bankroll");
        emit BetPlaced(msg.sender, msg.value);
    }

    // ── Owner pays out a win (called server-side when player cashes out)
    function payout(
        address player,
        uint256 betAmount,
        uint256 multX100
    ) external onlyOwner {
        require(multX100 >= 80 && multX100 <= MAX_MULT_X100, "Invalid multiplier");
        uint256 amount = (betAmount * multX100) / 100;
        require(address(this).balance >= amount, "Insufficient bankroll");
        emit Payout(player, betAmount, multX100, amount);
        payable(player).transfer(amount);
    }

    // ── Owner registers a crash (no payout — bet already in vault)
    function registerCrash(address player, uint256 betAmount) external onlyOwner {
        emit Crashed(player, betAmount);
    }

    // ── Owner withdraws house funds
    function withdraw(uint256 amount) external onlyOwner {
        payable(owner).transfer(amount);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
