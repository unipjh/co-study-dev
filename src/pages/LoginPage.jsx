export default function LoginPage({ onSignIn }) {
  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.logo}>co-study</div>
        <p style={styles.desc}>PDF를 함께 공부하는 공간</p>
        <button style={styles.googleBtn} onClick={onSignIn}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Google로 시작하기
        </button>
      </div>
    </div>
  )
}

const styles = {
  root: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '48px 40px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    minWidth: 320,
  },
  logo: {
    fontSize: 28,
    fontWeight: 800,
    color: '#1a1a1a',
    letterSpacing: -1,
  },
  desc: {
    fontSize: 14,
    color: '#888',
    margin: 0,
  },
  googleBtn: {
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 20px',
    borderRadius: 8,
    border: '1px solid #e0e0e0',
    background: '#fff',
    fontSize: 14,
    fontWeight: 600,
    color: '#1a1a1a',
    cursor: 'pointer',
    width: '100%',
    justifyContent: 'center',
    transition: 'background 0.12s',
  },
}
