# Mevcut Echidna imajını temel al
FROM trailofbits/echidna:latest

# Derleyiciyi kurmak için root yetkilerine geç
USER root

# İhtiyacımız olan Solidity 0.8.24 sürümünü kur
RUN solc-select install 0.8.24

# Kurulan sürümü varsayılan olarak ayarla
RUN solc-select use 0.8.24

# !!! BU SATIRI SİL veya YORUM SATIRI YAP !!!
# USER echidna