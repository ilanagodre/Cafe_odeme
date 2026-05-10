#!/bin/bash
# Backup cron job kurulumu
# Kullanım: ./database/setup-cron.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"
BACKUP_DIR="/var/backups/cafe_payment"
CRON_LOG="/var/log/cafe_backup.log"

# Script çalıştırılabilir yap
chmod +x "$BACKUP_SCRIPT"

# Backup dizini oluştur
mkdir -p "$BACKUP_DIR"

# Mevcut cron job'u kaldır (varsa)
crontab -l 2>/dev/null | grep -v "cafe.*backup" | crontab - || true

# Yeni cron job ekle: Her gün 02:00'de yedek al
(crontab -l 2>/dev/null; echo "0 2 * * * $BACKUP_SCRIPT $BACKUP_DIR >> $CRON_LOG 2>&1") | crontab -

echo "Cron job kuruldu:"
echo "  Zamanlama: Her gün 02:00"
echo "  Backup dizini: $BACKUP_DIR"
echo "  Log dosyası: $CRON_LOG"
echo ""
echo "Mevcut cron jobs:"
crontab -l | grep cafe || echo "(boş)"
echo ""
echo "Manuel test için: $BACKUP_SCRIPT $BACKUP_DIR"
