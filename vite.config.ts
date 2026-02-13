import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// import workerLoader from 'worker-loader';
import path from 'path';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    // 启用热模块替换
    hmr: true,
    // 监听所有网络接口
    host: true,
    // 在开发服务器中处理历史模式路由
    // 当请求的路径不存在时，返回 index.html
    proxy: {
      // 这里可以添加代理配置
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  css: {
    // 对css的行为进行配置
    preprocessorOptions: {
      // key + config key代表预处理器的名
      scss: {
          // 整个的配置对象都会最终给到scss的执行参数（全局参数）中去
          math: 'always',
          globalVars: {
              // 全局变量
              // mainColor: 'red'
          }
      }
    },
    modules: {
      // 配置当前的模块化行为是模块化还是全局化 (有hash就是开启了模块化的一个标志, 因为他可以保证产生不同的hash值来控制我们的样式类名不被覆盖)
      scopeBehaviour: 'local',
      // 自定义生成哈希名称的规则，例如：更改哈希名称的长度等
      generateScopedName: '[name]_[local]_[hash:base64:5]',
      // generateScopedName: (name, filename, css) => {
      //     // name -> 代表的是你此刻css文件中的类名
      //     // filename -> 是你当前css文件的绝对路径
      //     // css -> 给的就是你当前样式
      //     console.log('name', name, 'filename', filename, 'css', css) // 这一行会输出在哪？？？ 输出在node
      //     // 配置成函数以后, 返回值就决定了他最终显示的类型
      //     return `${name}_${Math.random().toString(36).substr(3, 8)}`
      // },
      // 是对css模块化的默认行为进行覆盖
      // 修改生成的配置对象的key的展示形式(驼峰还是中划线形式)
      localsConvention: 'camelCase',

      // 生成hash会根据类名 + 一些其他的字符串(文件名 + 他内部随机生成一个字符串)去进行生成, 如果想要生成hash更加的独特一点, 可以配置hashPrefix, 配置的这个字符串会参与到最终的hash生成, （hash: 只要字符串有一个字不一样, 那么生成的hash就完全不一样, 但是只要字符串完全一样, 生成的hash就会一样）
      // hashPrefix: "hello",

      // 代表不想参与到css模块化的路径
      // globalModulePaths: ['./component.module.css'], 
    }
  },
  resolve: {
    alias: {
          '@': path.resolve('src'),
          'src': path.resolve('src'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  build: {
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        //配置这个是让不同类型文件放在不同文件夹，不会显得太乱
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: '[ext]/[name]-[hash].[ext]',
        manualChunks(id) {
          //静态资源分拆打包
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        },
      },
    },
    target: 'esnext',
    outDir: 'dist', // 指定输出路径
    assetsDir: 'assets', // 指定生成静态文件目录
    assetsInlineLimit: 4096, // 小于此阈值的导入或引用资源将内联为 base64 编码
    chunkSizeWarningLimit: 500, // chunk 大小警告的限制
    minify: 'terser', // 混淆器，terser构建后文件体积更小
    emptyOutDir: true, //打包前先清空原有打包文件
  },
  define: {
    __INTLIFY_PROD_DEVTOOLS__: false,
    'process.env': {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development'),
    },
  },
});
