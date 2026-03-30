/**
 * @fileoverview 전역 네비게이션
 * @description sessionStorage 기준 로그인/관리자 링크 노출, 로그아웃 처리.
 */
document.addEventListener("DOMContentLoaded", () => {
  setupNavigation()
})

/** @returns {Object|null} user JSON (sessionStorage 우선) */
function getStoredUser() {
  const userStr = sessionStorage.getItem("user")
  try {
    return userStr ? JSON.parse(userStr) : null
  } catch (e) {
    return null
  }
}

function setupNavigation() {
  const user = getStoredUser()
  if (user && user.role === "admin") {
    const page = window.location.pathname.split("/").pop()
    if (page !== "admin.html" && page !== "admin-login.html") {
      showNotification?.("허용되지 않은 접근입니다.", "error")
      window.location.replace("admin.html")
      return
    }
  }
  const authBtn = document.getElementById("navAuthButton")

  if (authBtn) {
    if (user) {
      authBtn.textContent = "로그아웃"
      authBtn.href = "#"
      authBtn.classList.remove("btn-primary")
      authBtn.classList.add("btn-secondary")
      authBtn.addEventListener("click", (event) => {
        event.preventDefault()
        performLogout()
      })
    } else {
      authBtn.textContent = "로그인"
      authBtn.href = "login.html"
      authBtn.classList.add("btn-primary")
      authBtn.classList.remove("btn-secondary")
    }
  }

  let adminLink = document.querySelector("[data-nav=\"admin\"]")
  if (user && user.role === "admin") {
    if (!adminLink) {
      const navLinks = document.querySelector(".nav-links")
      if (navLinks) {
        const dashboardLink = document.querySelector("[data-nav=\"dashboard\"]")
        adminLink = document.createElement("a")
        adminLink.href = "admin.html"
        adminLink.setAttribute("data-nav", "admin")
        adminLink.textContent = "관리자"
        if (dashboardLink) {
          navLinks.insertBefore(adminLink, dashboardLink.nextSibling)
        } else {
          navLinks.appendChild(adminLink)
        }
      }
    }
    if (adminLink) {
      adminLink.style.display = ""
      adminLink.classList.remove("disabled-link")
    }
  } else {
    if (adminLink) {
      adminLink.style.display = "none"
    }
  }

  document.querySelectorAll("[data-requires-auth=\"true\"]").forEach((link) => {
    if (!user) {
      link.classList.add("disabled-link")
      link.addEventListener("click", (event) => {
        event.preventDefault()
        window.location.href = "login.html"
      })
    } else {
      link.classList.remove("disabled-link")
    }
  })
}

function performLogout() {
  localStorage.removeItem("user")
  localStorage.removeItem("token")
  sessionStorage.clear()
  window.location.href = "index.html"
}


