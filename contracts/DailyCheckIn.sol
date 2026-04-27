// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * DailyCheckIn v1
 *
 * Players call checkIn() with a small ETH payment.
 * The contract forwards the full value to the treasury.
 * Emits a CheckIn event that the backend reads to validate
 * the streak and issue a signed token.
 *
 * The required fee is set by the owner and can be updated
 * to track ~$0.01 USD as the ETH price changes.
 */
contract DailyCheckIn {
    address public owner;
    address public treasury;
    uint256 public fee; // in wei — owner updates periodically to track $0.01 USD

    event CheckedIn(address indexed player, uint256 feePaid, uint256 timestamp);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _treasury, uint256 _fee) {
        owner     = msg.sender;
        treasury  = _treasury;
        fee       = _fee;
    }

    /**
     * Player checks in for the day.
     * Must send exactly >= fee wei.
     * Excess is refunded to the player.
     */
    function checkIn() external payable {
        require(msg.value >= fee, "Insufficient fee");

        // Forward fee to treasury
        (bool sent, ) = payable(treasury).call{ value: fee }("");
        require(sent, "Treasury transfer failed");

        // Refund excess if any
        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{ value: excess }("");
            require(refunded, "Refund failed");
        }

        emit CheckedIn(msg.sender, fee, block.timestamp);
    }

    /**
     * Owner updates the fee to keep it near $0.01 USD.
     */
    function setFee(uint256 _newFee) external onlyOwner {
        emit FeeUpdated(fee, _newFee);
        fee = _newFee;
    }

    /**
     * Owner updates the treasury address.
     */
    function setTreasury(address _treasury) external onlyOwner {
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    /**
     * View helpers
     */
    function getFee() external view returns (uint256) {
        return fee;
    }
}
