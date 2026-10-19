/**
 * Script nhận diện và bắt sự kiện đăng nhập trên trang web
 * ĐÃ ĐƯỢC TỐI ƯU BẢO MẬT & LỌC CHẶT CHẼ:
 * - Lọc bỏ 100% mã OTP, mã xác thực 2FA/MFA, mã SMS, mã PIN, mã CVV/CVC thẻ ngân hàng, Captcha.
 * - Yêu cầu BẮT BUỘC phải có Tên đăng nhập / Email / Số điện thoại thật sự (không chấp nhận rỗng hay fallback "Tài khoản").
 * - Kiểm tra ngữ cảnh form đăng nhập, loại trừ các form tìm kiếm hoặc xác thực 1 lần.
 */
export const PASSWORD_INTERCEPT_SCRIPT = `
(function() {
  if (window.__kite_pwd_interceptor_loaded) return;
  window.__kite_pwd_interceptor_loaded = true;

  try {
    var lastCapturedKey = '';
    var pendingPassword = '';
    var pendingUsername = '';

    // Native Setter để tự điền thông tin tài khoản & mật khẩu bypass qua Virtual DOM của React/Vue/Angular
    window.__kite_fill_credential = function(user, pass) {
      try {
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        var passInputs = document.querySelectorAll('input[type="password"]');
        var pInput = null;
        for (var i = 0; i < passInputs.length; i++) {
          var pi = passInputs[i];
          if (pi.offsetParent !== null && !isOtpOrNonPasswordField(pi)) {
            pInput = pi;
            break;
          }
        }

        var form = pInput && pInput.closest ? pInput.closest('form') : null;
        var uInput = null;
        if (form) {
          uInput = form.querySelector('input[autocomplete="username"], input[autocomplete="email"], input[type="email"], input[type="text"], input[type="tel"], input[name*="user" i], input[name*="login" i]');
        }
        if (!uInput) {
          uInput = document.querySelector('input[autocomplete="username"], input[autocomplete="email"], input[type="email"], input[type="text"], input[name*="user" i], input[name*="login" i]');
        }

        if (uInput && user) {
          if (setter) {
            setter.call(uInput, user);
          } else {
            uInput.value = user;
          }
          uInput.dispatchEvent(new Event('input', { bubbles: true }));
          uInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (pInput && pass) {
          if (setter) {
            setter.call(pInput, pass);
          } else {
            pInput.value = pass;
          }
          pInput.dispatchEvent(new Event('input', { bubbles: true }));
          pInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      } catch(e) {
        return false;
      }
    };

    // Hàm nhận diện ô nhập liệu là OTP, 2FA, PIN, CVV, Captcha hay mã xác thực 1 lần
    function isOtpOrNonPasswordField(el) {
      if (!el) return false;
      var autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
      if (autocomplete === 'one-time-code' || autocomplete.includes('otp') || autocomplete === 'cc-csc') {
        return true;
      }

      var tag = (
        (el.name || '') + ' ' +
        (el.id || '') + ' ' +
        (el.className || '') + ' ' +
        (el.getAttribute('placeholder') || '') + ' ' +
        (el.getAttribute('aria-label') || '') + ' ' +
        (el.getAttribute('title') || '')
      ).toLowerCase();

      var otpKeywords = [
        'otp', '2fa', 'mfa', 'totp', 'token', 'one-time', 'onetime',
        'verification', 'verify', 'verif', 'passcode',
        'xac_nhan', 'xac_thuc', 'xacnhan', 'xacthuc', 'ma_xac', 'maxac',
        'security_code', 'securitycode', 'auth_code', 'authcode',
        'sms_code', 'smscode', 'pin_code', 'pincode', 'cvv', 'cvc',
        'captcha', 'recaptcha', 'anti_bot', 'security_pin'
      ];

      for (var i = 0; i < otpKeywords.length; i++) {
        if (tag.includes(otpKeywords[i])) return true;
      }

      // Kiểm tra ô nhập số ngắn (thường là mã OTP 4 - 8 chữ số)
      var inputMode = (el.getAttribute('inputmode') || '').toLowerCase();
      var maxLen = parseInt(el.getAttribute('maxlength') || '0', 10);
      if (inputMode === 'numeric' && maxLen > 0 && maxLen <= 8) {
        return true;
      }

      return false;
    }

    // Hàm kiểm tra ô có phải là ô tìm kiếm hoặc trường rác không liên quan
    function isSearchOrIrrelevantField(el) {
      if (!el) return true;
      if (el.type === 'search' || el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio') return true;
      var tag = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
      var badTags = ['search', 'query', 'tim_kiem', 'keyword', 'filter', 'coupon', 'voucher', 'captcha', 'otp'];
      for (var i = 0; i < badTags.length; i++) {
        if (tag.includes(badTags[i])) return true;
      }
      return false;
    }

    // 1. Lắng nghe liên tục khi người dùng gõ
    document.addEventListener('input', function(e) {
      try {
        var el = e.target;
        if (!el) return;

        if (el.type === 'password') {
          // Bỏ qua nếu đây là ô nhập OTP hoặc mã xác nhận
          if (isOtpOrNonPasswordField(el)) {
            pendingPassword = '';
            return;
          }

          pendingPassword = el.value || '';

          // Tìm ô tài khoản trong cùng form hoặc lân cận
          var form = el.closest ? el.closest('form') : null;
          var userInput = form
            ? form.querySelector('input[type="email"], input[type="text"], input[type="tel"], input[name*="user" i], input[name*="login" i], input[name*="account" i], input[name*="phone" i], input[autocomplete="username"], input[autocomplete="email"]')
            : null;

          if (!userInput) {
            userInput = document.querySelector('input[autocomplete="username"], input[autocomplete="email"], input[name*="user" i], input[name*="login" i]');
          }

          if (userInput && userInput.value && !isOtpOrNonPasswordField(userInput) && !isSearchOrIrrelevantField(userInput)) {
            pendingUsername = userInput.value.trim();
          }
        } else if (el.type === 'email' || el.type === 'text' || el.type === 'tel') {
          if (isSearchOrIrrelevantField(el) || isOtpOrNonPasswordField(el)) return;
          var tag = (el.name || el.id || el.getAttribute('autocomplete') || '').toLowerCase();
          if (
            el.type === 'email' ||
            el.type === 'tel' ||
            tag.includes('user') ||
            tag.includes('login') ||
            tag.includes('email') ||
            tag.includes('account') ||
            tag.includes('phone')
          ) {
            pendingUsername = (el.value || '').trim();
          }
        }
      } catch (err) {}
    }, true);

    // 1b. Lắng nghe sự kiện Focus vào ô nhập tài khoản hoặc mật khẩu để kích hoạt gợi ý Autofill
    document.addEventListener('focusin', function(e) {
      try {
        var el = e.target;
        if (!el || isOtpOrNonPasswordField(el) || isSearchOrIrrelevantField(el)) return;

        var isPwd = el.type === 'password';
        var isUser = el.type === 'email' || el.type === 'text' || el.type === 'tel';
        var tag = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('autocomplete') || '')).toLowerCase();

        var hasPasswordNearby = isPwd;
        if (isUser && !hasPasswordNearby) {
          var form = el.closest ? el.closest('form') : null;
          if (form && form.querySelector('input[type="password"]')) {
            hasPasswordNearby = true;
          } else if (document.querySelector('input[type="password"]')) {
            hasPasswordNearby = true;
          }
        }

        if ((isPwd || tag.includes('user') || tag.includes('login') || tag.includes('email') || tag.includes('account')) && hasPasswordNearby) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PASSWORD_FORM_FOCUSED',
              website: location.hostname || location.host,
            }));
          }
        }
      } catch (err) {}
    }, true);

    // 2. Hàm gửi thông tin tài khoản đã nhận diện về Kite Browser
    var triggerDetectedLogin = function(sourceEl) {
      try {
        var pwdVal = pendingPassword;
        var userVal = pendingUsername;

        var pwdInput = null;
        var form = sourceEl && sourceEl.closest ? sourceEl.closest('form') : null;
        if (form) {
          pwdInput = form.querySelector('input[type="password"]');
        }
        if (!pwdInput) {
          pwdInput = document.querySelector('input[type="password"]');
        }

        // Kiểm tra phần tử password: nếu là OTP -> DỪNG NGAY
        if (pwdInput) {
          if (isOtpOrNonPasswordField(pwdInput)) return;
          if (pwdInput.value) {
            pwdVal = pwdInput.value;
          }
        }

        if (form) {
          var userInput = form.querySelector('input[autocomplete="username"], input[autocomplete="email"], input[type="email"], input[type="text"], input[type="tel"], input[name*="user" i], input[name*="login" i]');
          if (userInput && userInput.value && !isOtpOrNonPasswordField(userInput) && !isSearchOrIrrelevantField(userInput)) {
            userVal = userInput.value.trim();
          }
        }

        // ĐIỀU KIỆN TIÊN QUYẾT:
        // 1. Phải có username thực tế (độ dài >= 3 ký tự, không chấp nhận rỗng hay từ khóa rác)
        if (!userVal || userVal.length < 3) return;
        var lowerUser = userVal.toLowerCase();
        if (lowerUser === 'tài khoản' || lowerUser === 'tai khoan' || lowerUser === 'admin' || lowerUser === 'undefined' || lowerUser === 'null') {
          return;
        }

        // 2. Mật khẩu phải có độ dài từ 4 ký tự trở lên
        if (!pwdVal || pwdVal.length < 4) return;

        // 3. Nếu mật khẩu thuần 4-8 chữ số và trang/form có dấu hiệu xác nhận OTP -> bỏ qua
        if (/^\d{4,8}$/.test(pwdVal)) {
          var formText = (form ? (form.innerText || '') : (document.body ? document.body.innerText.substring(0, 500) : '')).toLowerCase();
          if (
            formText.includes('otp') ||
            formText.includes('mã xác') ||
            formText.includes('xác nhận mã') ||
            formText.includes('verification code') ||
            formText.includes('mã xác thực') ||
            formText.includes('sms')
          ) {
            return;
          }
        }

        var isNewPass = false;
        if (pwdInput && (pwdInput.getAttribute('autocomplete') === 'new-password' || (form && form.querySelectorAll('input[type="password"]').length >= 2))) {
          isNewPass = true;
        }

        var domain = location.hostname || location.host;
        var key = domain + '|' + userVal + '|' + pwdVal;

        if (lastCapturedKey !== key) {
          lastCapturedKey = key;
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'DETECTED_LOGIN',
              website: domain,
              username: userVal,
              password: pwdVal,
              isNewPass: isNewPass,
            }));
          }
        }
      } catch (err) {}
    };

    // 3. Bắt sự kiện Submit form chuẩn
    document.addEventListener('submit', function(e) {
      triggerDetectedLogin(e.target);
    }, true);

    // 4. Bắt sự kiện Click nút Đăng nhập
    document.addEventListener('click', function(e) {
      var btn = e.target && e.target.closest ? e.target.closest('button, input[type="submit"], [role="button"], a') : null;
      if (btn) {
        var btnText = (btn.innerText || btn.value || '').toLowerCase();
        // Không bắt các nút gửi lại OTP hay hủy
        if (btnText.includes('gửi lại') || btnText.includes('resend') || btnText.includes('hủy') || btnText.includes('cancel')) {
          return;
        }

        var isSubmitType = btn.type === 'submit' || (btn.getAttribute && btn.getAttribute('type') === 'submit');
        var hasLoginKeyword =
          btnText.includes('đăng nhập') ||
          btnText.includes('login') ||
          btnText.includes('sign in') ||
          btnText.includes('log in') ||
          btnText.includes('tiếp tục') ||
          btnText.includes('tiếp theo') ||
          btnText.includes('continue') ||
          btnText.includes('submit');

        var pwdOnPage = document.querySelector('input[type="password"]');
        var hasPasswordFilled = Boolean(pendingPassword || (pwdOnPage && pwdOnPage.value && !isOtpOrNonPasswordField(pwdOnPage)));

        if ((isSubmitType || hasLoginKeyword) && hasPasswordFilled) {
          triggerDetectedLogin(btn);
        }
      }
    }, true);

    // 5. Bắt phím Enter
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        var activeEl = document.activeElement;
        var pwdOnPage = document.querySelector('input[type="password"]');
        if (pendingPassword || (pwdOnPage && pwdOnPage.value && !isOtpOrNonPasswordField(pwdOnPage))) {
          setTimeout(function() {
            triggerDetectedLogin(activeEl);
          }, 100);
        }
      }
    }, true);

    // 6. Bắt sự kiện chuyển trang sau khi login
    window.addEventListener('beforeunload', function() {
      if (pendingPassword) {
        triggerDetectedLogin(null);
      }
    }, true);

    window.addEventListener('pagehide', function() {
      if (pendingPassword) {
        triggerDetectedLogin(null);
      }
    }, true);

  } catch(e) {}
})();
true;
`;
