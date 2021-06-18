pragma solidity ^0.8.1;

interface ICryptoPunks {
  function punkIndexToAddress(uint punkIndex) external view returns (address);

  function transferPunk(address punkIndex, uint transferPunkIndex) external;
}
