export const configOptionsColumns = [
  {
    title: '选项',
    dataIndex: 'option',
    key: 'option',
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
  },
  {
    title: '默认值',
    dataIndex: 'defaultValue',
    key: 'defaultValue',
  },
  {
    title: '说明',
    dataIndex: 'description',
    key: 'description',
  },
];

export const configOptionsDataSource = [
  {
    key: '1',
    option: 'format',
    type: 'string',
    defaultValue: '""',
    description: '数据格式，支持 \'json\' 和 \'string\'',
  },
  {
    key: '2',
    option: 'reconnection',
    type: 'boolean',
    defaultValue: 'false',
    description: '是否自动重连',
  },
  {
    key: '3',
    option: 'reconnectionAttempts',
    type: 'number',
    defaultValue: '5',
    description: '重连尝试次数',
  },
  {
    key: '4',
    option: 'reconnectionDelay',
    type: 'number',
    defaultValue: '1000',
    description: '初始重连延迟时间(ms)',
  },
  {
    key: '5',
    option: 'maxReconnectionDelay',
    type: 'number',
    defaultValue: '30000',
    description: '最大重连延迟时间(ms)',
  },
  {
    key: '6',
    option: 'reconnectionDelayGrowFactor',
    type: 'number',
    defaultValue: '1.5',
    description: '重连延迟增长因子',
  },
  {
    key: '7',
    option: 'connectManually',
    type: 'boolean',
    defaultValue: 'false',
    description: '是否手动连接',
  },
  {
    key: '8',
    option: 'onOpen',
    type: 'function',
    defaultValue: '-',
    description: '连接打开时的回调',
  },
  {
    key: '9',
    option: 'onClose',
    type: 'function',
    defaultValue: '-',
    description: '连接关闭时的回调',
  },
  {
    key: '10',
    option: 'onError',
    type: 'function',
    defaultValue: '-',
    description: '发生错误时的回调',
  },
  {
    key: '11',
    option: 'onMessage',
    type: 'function',
    defaultValue: '-',
    description: '收到消息时的回调',
  },
];

export const readyStateColumns = [
  {
    title: '状态码',
    dataIndex: 'code',
    key: 'code',
  },
  {
    title: '常量',
    dataIndex: 'constant',
    key: 'constant',
  },
  {
    title: '说明',
    dataIndex: 'description',
    key: 'description',
  },
];

export const readyStateDataSource = [
  {
    key: '1',
    code: '0',
    constant: 'WebSocket.CONNECTING',
    description: '正在连接',
  },
  {
    key: '2',
    code: '1',
    constant: 'WebSocket.OPEN',
    description: '已连接',
  },
  {
    key: '3',
    code: '2',
    constant: 'WebSocket.CLOSING',
    description: '正在关闭',
  },
  {
    key: '4',
    code: '3',
    constant: 'WebSocket.CLOSED',
    description: '已关闭',
  },
];
