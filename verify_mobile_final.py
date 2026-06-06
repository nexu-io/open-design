from playwright.sync_api import sync_playwright

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()

        # Inject the logic manually as if it were the bridge
        page.add_init_script("""
            window.addEventListener('load', () => {
               document.documentElement.setAttribute('data-od-client-type', 'android');
            });
        """)

        url = "http://localhost:17573"
        page.goto(url)
        import time
        time.sleep(10)

        client_type = page.evaluate("document.documentElement.getAttribute('data-od-client-type')")
        print(f"Client type attribute: {client_type}")

        page.screenshot(path="mobile_final_v9.png")
        browser.close()

if __name__ == "__main__":
    verify()
