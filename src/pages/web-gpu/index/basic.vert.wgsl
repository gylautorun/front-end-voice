// @vertex : 属性装饰器，表示这是一个顶点着色器函数
// 输入参数：@builtin(vertex_index) VertexIndex : u32
// - @builtin(vertex_index) 内置变量，由 WebGPU 自动提供，表示当前处理的顶点索引
// - VertexIndex : 参数名
// - u32 : 数据类型, 表示无符号32位整数
// @builtin(position) vec4<f32> : 返回类型
// - @builtin(position) : 内置变量，表示顶点的最终位置
// - vec4<f32> : 数据类型, 表示4分量浮点数向量
@vertex
fn main(
    @builtin(vertex_index) VertexIndex : u32 
) -> @builtin(position) vec4<f32> {
    // 定义三角形的三个顶点位置
    // let positions = array<vec2<f32>, 3>(): 定义一个包含3个 vec2<f32> 元素的数组
    // vec2<f32>(x, y) : 2分量浮点数向量, 表示顶点的2D坐标, 范围从 -1.0 到 1.0
    let positions = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.5),  // 顶部
        vec2<f32>(-0.5, -0.5), // 左下角
        vec2<f32>(0.5, -0.5)   // 右下角
    );
    // 根据顶点索引获取位置
    let position = positions[VertexIndex];
    // 返回齐次坐标
    // vec4<f32>(position, 0.0, 1.0) : 将2D位置转换为4D齐次坐标并返回
    /**
    * 顶点着色器函数返回的 vec4<f32> 表示顶点的最终位置，其中 x 和 y 分量表示顶点的 X 和 Y 坐标, 
    * z 分量表示顶点的深度, w 分量表示顶点的权重
    *  - vec4<f32>(x, y, z, w) : 4分量浮点数向量
    - position : 前两个分量 (x, y)
    - 0.0 : 第三个分量 (z)，表示深度
    - 1.0 : 第四个分量 (w)，齐次坐标的权重
    */
    return vec4<f32>(position, 0.0, 1.0);
}