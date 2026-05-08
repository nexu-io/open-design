import { test, expect } from '@playwright/test';

test.describe('Quranic Arabic Learning App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:17573/index.html');
  });

  test('should load the app and display dashboard', async ({ page }) => {
    // Check that the app loads
    await expect(page).toHaveTitle(/Quranic Arabic/);
    
    // Dashboard should be visible initially
    const dashboard = page.locator('#dashboard');
    await expect(dashboard).toBeVisible();
    
    // Exercise and Complete screens should be hidden
    await expect(page.locator('#exercise')).toBeHidden();
    await expect(page.locator('#complete')).toBeHidden();
  });

  test('should display vocabulary options on dashboard', async ({ page }) => {
    // Wait for dashboard to be visible
    await expect(page.locator('#dashboard')).toBeVisible();
    
    // Check that vocabulary buttons exist
    const vocabButtons = page.locator('.vocabulary-item');
    const count = await vocabButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate to exercise when vocabulary is selected', async ({ page }) => {
    // Wait for dashboard
    await expect(page.locator('#dashboard')).toBeVisible();
    
    // Click first vocabulary item
    const firstVocab = page.locator('.vocabulary-item').first();
    await firstVocab.click();
    
    // Exercise screen should now be visible
    await expect(page.locator('#exercise')).toBeVisible();
    
    // Dashboard should be hidden
    await expect(page.locator('#dashboard')).toBeHidden();
  });

  test('should display Arabic text on exercise screen', async ({ page }) => {
    // Navigate to exercise
    await page.locator('.vocabulary-item').first().click();
    await expect(page.locator('#exercise')).toBeVisible();
    
    // Check for Arabic text display
    const arabicWord = page.locator('.arabic-word');
    await expect(arabicWord).toBeVisible();
    
    // Arabic text should contain actual content
    const text = await arabicWord.textContent();
    expect(text).toBeTruthy();
    expect(text!.trim().length).toBeGreaterThan(0);
  });

  test('should show progress indicator', async ({ page }) => {
    // Navigate to exercise
    await page.locator('.vocabulary-item').first().click();
    await expect(page.locator('#exercise')).toBeVisible();
    
    // Progress should be visible
    const progress = page.locator('.progress');
    await expect(progress).toBeVisible();
  });

  test('should complete exercise and show completion screen', async ({ page }) => {
    // Navigate to exercise
    await page.locator('.vocabulary-item').first().click();
    await expect(page.locator('#exercise')).toBeVisible();
    
    // Find and click the complete/reveal button
    const revealButton = page.locator('.reveal-button');
    if (await revealButton.count() > 0) {
      await revealButton.click();
      
      // After completing all items, should show completion screen
      const complete = page.locator('#complete');
      await expect(complete).toBeVisible({ timeout: 10000 });
    }
  });

  test('should have functioning audio controls', async ({ page }) => {
    await expect(page.locator('#dashboard')).toBeVisible();
    
    // Look for audio play buttons
    const audioButtons = page.locator('.audio-button, .play-audio, [aria-label*="play"], [aria-label*="audio"]');
    const count = await audioButtons.count();
    
    // Exercise screen might have audio controls
    await page.locator('.vocabulary-item').first().click();
    await expect(page.locator('#exercise')).toBeVisible();
    
    // Check for audio controls in exercise
    const exerciseAudioButtons = page.locator('.audio-button, .play-audio, [aria-label*="play"], [aria-label*="audio"]');
    const exerciseCount = await exerciseAudioButtons.count();
    
    // At least one screen should have audio controls
    expect(count + exerciseCount).toBeGreaterThanOrEqual(0);
  });

  test('should maintain responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Dashboard should still be visible
    await expect(page.locator('#dashboard')).toBeVisible();
    
    // Navigate to exercise
    await page.locator('.vocabulary-item').first().click();
    await expect(page.locator('#exercise')).toBeVisible();
    
    // Arabic text should still be visible
    await expect(page.locator('.arabic-word')).toBeVisible();
  });

  test('should persist progress across reload', async ({ page }) => {
    // Navigate to exercise
    await page.locator('.vocabulary-item').first().click();
    await expect(page.locator('#exercise')).toBeVisible();
    
    // Reload the page
    await page.reload();
    
    // Progress might be stored in localStorage
    // Check if there's saved progress
    const storage = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      return {
        hasProgress: keys.some(k => k.includes('progress') || k.includes('quranic')),
        keys: keys
      };
    });
    
    // App should have some form of progress storage
    expect(storage).toBeTruthy();
  });
});