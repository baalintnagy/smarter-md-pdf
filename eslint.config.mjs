export default [
    {
        ignores: ['node_modules/**', 'dist/**', 'test-results/**', 'vendor/**'],
    },
    {
        files: ['**/*.{js,mjs}'],
        rules: {
            curly: ['error', 'all'],
            'no-unused-vars': ['error', { args: 'none', caughtErrorsIgnorePattern: '^_$' }],
        },
    },
];
