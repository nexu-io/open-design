import asyncio
from playwright.async_api import async_playwright
import time

async def verify():
    async with async_playwright() as p:
        # Emulate a Pixel 5
        device = p.devices['Pixel 5']
        browser = await p.chromium.launch()
        context = await browser.new_context(**device)
        page = await context.new_page()

        print("Navigating to app...")
        try:
            # Setting the cookie/localStorage for android client type
            await page.add_init_script("""
                window.localStorage.setItem('open-design:config', JSON.stringify({
                    theme: 'light',
                    accentColor: '#c96442'
                }));
                // Force android client type detection
                window.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
            """)

            await page.goto("http://localhost:17573", wait_until="networkidle")
            # Wait for the app to mount
            await page.wait_for_selector("[data-od-app-mounted='1']", timeout=30000)

            # Set data-od-client-type to android manually if initializeAndroidBridge didn't catch it
            await page.evaluate("document.documentElement.setAttribute('data-od-client-type', 'android')")

            print("Taking home screenshot...")
            await page.screenshot(path="/home/jules/verification/mobile_home_android.png")

            print("Checking for rail toggle...")
            toggle = page.locator("[data-testid='entry-rail-toggle']")
            if await toggle.is_visible():
                print("Rail toggle is visible. Clicking it...")
                await toggle.click()
                await asyncio.sleep(0.5) # Wait for transition
                await page.screenshot(path="/home/jules/verification/mobile_rail_open.png")
                # Close it
                await page.locator("[data-testid='entry-nav-collapse']").click()
                await asyncio.sleep(0.5)

            print("Opening settings...")
            settings_btn = page.locator("[data-testid='entry-settings-trigger']")
            await settings_btn.click()

            # The menu opens first, then we click "Settings"
            print("Clicking Settings in menu...")
            # Using text because it's a menu item
            await page.get_by_role("menuitem", name="Settings").click()

            print("Taking settings screenshot...")
            await asyncio.sleep(1)
            await page.screenshot(path="/home/jules/verification/mobile_settings_android.png")

        except Exception as e:
            print(f"Error during verification: {e}")
            await page.screenshot(path="/home/jules/verification/error.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify())
