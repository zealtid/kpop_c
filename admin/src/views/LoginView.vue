<script setup lang="ts">
import { NButton, NCard, NForm, NFormItem, NInput } from "naive-ui";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authNotice, login, setAuthNotice } from "../auth";

const router = useRouter();
const route = useRoute();
const username = ref("");
const password = ref("");
const submitting = ref(false);
const error = ref(authNotice.value || "");

async function onSubmit() {
  error.value = "";
  setAuthNotice("");
  submitting.value = true;
  try {
    const message = await login(username.value.trim(), password.value);
    if (message) {
      error.value = message;
      return;
    }
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "";
    await router.replace(redirect && redirect !== "/login" ? redirect : { name: "home" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="wrap">
    <div class="panel">
      <div class="brand-panel">
        <p class="kicker">运营后台</p>
        <h1>星卡 Admin</h1>
        <p class="lead">图鉴、工单与导入校验的工作台。用户名 / 密码登录，无微信扫码。</p>
      </div>
      <n-card class="card" :bordered="false">
        <n-form @submit.prevent="onSubmit">
          <n-form-item label="用户名">
            <n-input
              v-model:value="username"
              autocomplete="username"
              placeholder="用户名"
              :disabled="submitting"
              :input-props="{ name: 'username', id: 'login-username' }"
            />
          </n-form-item>
          <n-form-item label="密码">
            <n-input
              v-model:value="password"
              type="password"
              show-password-on="click"
              autocomplete="current-password"
              placeholder="密码"
              :disabled="submitting"
              :input-props="{ name: 'password', id: 'login-password' }"
            />
          </n-form-item>
          <n-button type="primary" attr-type="submit" block :loading="submitting" :disabled="submitting">
            登录
          </n-button>
          <p v-if="error" class="err" role="alert">{{ error }}</p>
        </n-form>
      </n-card>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 16px 32px;
  background:
    radial-gradient(1200px 400px at 50% -10%, var(--color-brand-soft), transparent 60%),
    var(--color-bg-page);
}

.panel {
  width: 100%;
  max-width: 420px;
}

.brand-panel {
  margin-bottom: 16px;
  padding: 4px 4px 0;
}

.kicker {
  margin: 0 0 6px;
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.brand-panel h1 {
  margin: 0;
  font-size: 28px;
}

.lead {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.card {
  box-shadow: 0 12px 32px rgba(26, 27, 31, 0.06);
}

.err {
  color: var(--color-danger);
  font-size: 13px;
  min-height: 18px;
  margin: 12px 0 0;
}
</style>
