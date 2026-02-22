// Show Login Form
window.showLogin = function () {
  document.getElementById("title-container").style.display = "none";
  document.getElementById("auth-container").style.display = "block";
  document.getElementById("signup-container").style.display = "none";
  document.getElementById("main-sections").style.display = "none";
  document.getElementById("analysis-section").style.display = "none";
  document.getElementById("choose-scan-section").style.display = "none";
  document.getElementById("info-section").style.display = "none";
  
};

// Show Signup Form
window.showSignup = function () {
  document.getElementById("title-container").style.display = "none";
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("signup-container").style.display = "block";
  document.getElementById("main-sections").style.display = "none";
  document.getElementById("analysis-section").style.display = "none";
  document.getElementById("choose-scan-section").style.display = "none";
  document.getElementById("info-section").style.display = "none";
  
};

// Show Analysis Section
window.showAnalysis = function () {
  document.getElementById("title-container").style.display = "none";
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("signup-container").style.display = "none";
  document.getElementById("main-sections").style.display = "none";
  document.getElementById("choose-scan-section").style.display = "none";
  document.getElementById("info-section").style.display = "none";
  
  document.getElementById("analysis-section").style.display = "block";

};

// Show Choose Scan Section
window.showChooseScan = function () {
  document.getElementById("title-container").style.display = "none";
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("signup-container").style.display = "none";
  document.getElementById("main-sections").style.display = "none";
  document.getElementById("analysis-section").style.display = "none";
  document.getElementById("info-section").style.display = "none";
  document.getElementById("ocr-section").style.display = "none";
  document.getElementById('visualize-section').style.display = "none";
  document.getElementById("consultation-section").style.display = "none";
  document.getElementById("choose-scan-section").style.display = "block";
};

// Go Back to Home/Title View
window.goBack = function () {
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("signup-container").style.display = "none";
  document.getElementById("analysis-section").style.display = "none";
  document.getElementById("choose-scan-section").style.display = "none";

  document.getElementById("title-container").style.display = "block";
  document.getElementById("main-sections").style.display = "block";
  document.getElementById("info-section").style.display = "block";
};
window.showOCRSection = function () {
  // Hide all other sections
  document.getElementById("title-container").style.display = "none";
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("signup-container").style.display = "none";
  document.getElementById("main-sections").style.display = "none";
  document.getElementById("analysis-section").style.display = "none";
  document.getElementById("choose-scan-section").style.display = "none";
  document.getElementById("info-section").style.display = "none";
  document.getElementById('visualize-section').style.display = "none";
  
  document.getElementById("ocr-section").style.display = "block";
};

// Function to preview the uploaded scan image
function previewScan() {
  const fileInput = document.getElementById('scanFile');
  const file = fileInput.files[0];
  const previewImage = document.getElementById('scanPreview');
  const canvas = document.getElementById('highlightCanvas');
  const ctx = canvas.getContext('2d');

  if (!file || !file.type.startsWith("image/")) {
    alert("Please upload a valid image file (JPG or PNG).");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    previewImage.src = e.target.result;

    previewImage.onload = () => {
      // Resize canvas to match the image
      canvas.width = previewImage.width;
      canvas.height = previewImage.height;

      // Clear any previous drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  };

  reader.readAsDataURL(file);
}

// Function to simulate AI-based abnormality highlighting
function analyzeScan() {
  const canvas = document.getElementById('highlightCanvas');
  const ctx = canvas.getContext('2d');

  if (canvas.width === 0 || canvas.height === 0) {
    alert("Please upload a scan image first.");
    return;
  }

  // Simulated abnormality areas using red rectangles
  ctx.strokeStyle = "rgba(255, 0, 0, 0.85)";
  ctx.lineWidth = 4;

  // Example rectangles (can be dynamic in real case)
  ctx.strokeRect(canvas.width * 0.2, canvas.height * 0.3, 120, 80);
  ctx.strokeRect(canvas.width * 0.55, canvas.height * 0.5, 100, 70);

  alert("Abnormal regions have been highlighted.");
}
//Visualise Abnormalities section .
window.showVisualizeSection= function(){
  document.getElementById("title-container").style.display = "none";
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("signup-container").style.display = "none";
  document.getElementById("main-sections").style.display = "none";
  document.getElementById("analysis-section").style.display = "none";
  document.getElementById("choose-scan-section").style.display = "none";
  document.getElementById("info-section").style.display = "none";
  document.getElementById("consultation-section").style.display = "none";
  document.getElementById('visualize-section').style.display = 'block';


  // Start typing effect when this section is visible
  const text = "AI analysis results will appear here after processing...";
  const placeholder = document.getElementById("typing-placeholder");


  placeholder.textContent = "";
  let index = 0;
  function typeText() {
    if (index < text.length) {
      placeholder.textContent += text.charAt(index);
      index++;
      setTimeout(typeText, 40);
    }
  }

  setTimeout(typeText, 400);
};
//Consultation Section
window.showConsultationSection = function () {
  document.getElementById("title-container").style.display = "none";
  document.getElementById("auth-container").style.display = "none";
  document.getElementById("signup-container").style.display = "none";
  document.getElementById("main-sections").style.display = "none";
  document.getElementById("analysis-section").style.display = "none";
  document.getElementById("info-section").style.display = "none";
  document.getElementById("ocr-section").style.display = "none";
  document.getElementById("visualize-section").style.display = "none";
  document.getElementById("choose-scan-section").style.display = "none";
  document.getElementById("consultation-section").style.display = "block";
};







