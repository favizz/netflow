#include "SRusun_Display.h"
#include "sRusun_SDCard.h"

#include <Arduino.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

int lcdPage  = 0;
int LCD_PAGES = 3;

void initDisplay()
{
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("SRusun NetFlow");
  lcd.setCursor(0, 1);
  lcd.print("Starting...");
}

void updateLCD(const SensorSnap& s, float wt)
{
  lcd.clear();
  switch (lcdPage % LCD_PAGES)
  {
    case 0: // Sub-balances (electricity + water)
      lcd.setCursor(0, 0);
      lcd.print("E:"); lcd.print((long)electricBalance); lcd.print("Rp");
      lcd.setCursor(0, 1);
      lcd.print("W:"); lcd.print((long)waterBalance);    lcd.print("Rp");
      break;

    case 1: // Power + flowrate
      lcd.setCursor(0, 0);
      lcd.print("P:"); lcd.print(s.p, 0); lcd.print("W ");
      lcd.print("V:"); lcd.print(s.v, 0); lcd.print("V");
      lcd.setCursor(0, 1);
      lcd.print("F:"); lcd.print(s.wf, 1); lcd.print("L/m   ");
      break;

    case 2: // Cumulative totals
      lcd.setCursor(0, 0);
      lcd.print("E:"); lcd.print(s.et, 2); lcd.print("kWh");
      lcd.setCursor(0, 1);
      lcd.print("W:"); lcd.print(wt,   3); lcd.print("m3 ");
      break;
  }
}
