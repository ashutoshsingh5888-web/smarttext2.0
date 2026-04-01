/**
 * SmartText Onboarding Tutorial
 * 5-step interactive guide for new users
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const progressFill = document.getElementById('progress-fill');
  const stepDots = document.querySelectorAll('.step-dot');
  const steps = document.querySelectorAll('.step');
  const skipBtn = document.getElementById('skip-btn');
  const finishBtn = document.getElementById('finish-btn');
  
  // State
  let currentStep = 1;
  const totalSteps = 5;

  // Navigation handlers
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.onclick = () => goToStep(parseInt(btn.dataset.next));
  });
  
  document.querySelectorAll('[data-prev]').forEach(btn => {
    btn.onclick = () => goToStep(parseInt(btn.dataset.prev));
  });
  
  // Step dots clickable
  stepDots.forEach(dot => {
    dot.onclick = () => {
      const step = parseInt(dot.dataset.step);
      // Allow going back, or forward only one step at a time
      if (step <= currentStep + 1) {
        goToStep(step);
      }
    };
  });
  
  // Skip tutorial
  skipBtn.onclick = completeOnboarding;
  
  // Finish tutorial
  finishBtn.onclick = completeOnboarding;

  // Go to specific step
  function goToStep(step) {
    if (step < 1 || step > totalSteps) return;
    
    // Update UI
    steps.forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');
    
    stepDots.forEach((dot, index) => {
      dot.classList.toggle('active', index + 1 <= step);
    });
    
    // Update progress bar
    const progress = (step / totalSteps) * 100;
    progressFill.style.width = `${progress}%`;
    
    // Update state
    currentStep = step;
    
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Complete onboarding
  async function completeOnboarding() {
    // Mark onboarding as complete
    await chrome.storage.sync.set({ onboardingComplete: true });
    
    // Show completion toast
    showToast('🎉 Welcome to SmartText! Start typing your shortcuts anywhere.');
    
    // Close onboarding tab after brief delay
    setTimeout(() => {
      // Try to focus the main Chrome window
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        chrome.tabs.remove(tab.id);
      });
    }, 1500);
  }

  // Show toast notification
  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #f8fafc;
      padding: 14px 24px;
      border-radius: 12px;
      font-size: 14px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
      z-index: 10000;
      animation: slideUp 0.3s ease;
      border: 1px solid #475569;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Add animation keyframes if not present
    if (!document.getElementById('onboarding-animations')) {
      const style = document.createElement('style');
      style.id = 'onboarding-animations';
      style.textContent = `
        @keyframes slideUp {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `;
      document.head.appendChild(style);
    }
    
    setTimeout(() => {
      toast.style.animation = 'slideUp 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Initialize: Check if user came from install
  chrome.runtime.sendMessage({ action: 'getSettings' }).catch(() => {
    // If background not ready, wait and retry
    setTimeout(() => location.reload(), 500);
  });
});
